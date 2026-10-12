// CRITÉRIO DA VARREDURA DE E-MAIL — quando um e-mail da caixa conectada vira publicação. PURO.
//
// O defeito que isto corrige (medido em 12/10/2026): a "captura ampla" tratava como publicação
// QUALQUER e-mail cujo assunto tivesse "publicação", "despacho", "intimação" etc., de qualquer
// remetente e sem exigir número de processo. Entraram na fila 34 itens que não eram publicação:
// 17 do BTG Pactual ("Publicação de documentos no Portal"), 13 avisos do próprio Lúmen ("Novas
// publicações", que a varredura lia, transformava em publicação, gerando novo aviso) e 5 de
// GitHub/alertas de desenvolvedor — todos sem número de processo.
//
// A regra agora é: o que decide é o NÚMERO DE PROCESSO, e o remetente decide o grau de confiança.
//
//   RECUSAR     não é publicação; nada é gravado (só contado no resultado da varredura).
//   QUARENTENA  parece publicação mas falta confiança (remetente desconhecido, número fora do
//               padrão). Vai para a aba "Possível publicação" e NÃO gera prazo, selo, alerta nem
//               notificação até alguém promover. Guarda no máximo 1.000 caracteres do corpo.
//   ACEITAR     entra na fila de verdade.
//
// ORDEM DAS REGRAS (a primeira que casar decide):
//   0. Recusa dura: e-mail do próprio Lúmen; regra do escritório NEGAR; remetente de sistema
//      negado (GitHub, alertas do Google...); lista/automático em massa que não vem de tribunal.
//   1. Número de processo no assunto ou no corpo: CNJ de 20 dígitos com dígito verificador válido,
//      ou o número curto do Projudi de Goiás (`5618319.57`) quando o remetente é do Projudi/TJGO e há
//      "processo/nº/autos" colado ao número. Sem número nenhum: RECUSAR.
//   2. Remetente de tribunal ou do Jusbrasil, ou regra do escritório PERMITIR: ACEITAR.
//   3. Remetente desconhecido com número de processo CADASTRADO no escritório e marcador judicial
//      forte (intimação, despacho, decisão, sentença, prazo...): ACEITAR com `origemNaoReconhecida`
//      (a tela avisa "confira o remetente"). Decisão do dono em 12/10/2026: um falso negativo custa
//      um prazo; um falso positivo custa um clique.
//   4. Qualquer outro caso com número válido: QUARENTENA.

import { cnjValido, normalizarCnj } from "@/lib/cnjNumero";
import { chaveDoProcesso, numeroCurtoNoTexto } from "@/lib/processKey";

export const REMETENTES_DE_TRIBUNAL_E_JUSBRASIL = [
  "publicacoes-diarios@jusbrasil.com.br",
  "andamentos@jusbrasil.com.br",
];

// Domínios/trechos que identificam sistema de tribunal. Qualquer `.jus.br` vale; os nomes de sistema
// cobrem quem manda de domínio próprio.
const SISTEMA_DE_TRIBUNAL_NO_ENDERECO = /(^|[@.\-_])(projudi|eproc|esaj|e-saj|pje|tucujuris|pjecnj|comunicaapi)([.\-_@]|$)/i;

// Remetentes que nunca são publicação. Lista curta e de baixo risco; o resto é decidido por
// "sem número de processo → recusar".
export const REMETENTES_NEGADOS_DO_SISTEMA = [
  "@github.com",
  "@accounts.google.com",
  "@google.com",
  "@vercel.com",
  "@railway.app",
  "@railway.com",
  "@supabase.io",
  "@supabase.com",
  "@neon.tech",
  "@anthropic.com",
  "@mail.anthropic.com",
];

const MARCADOR_JUDICIAL_FORTE =
  /intima[cç][aã]o|cita[cç][aã]o|notifica[cç][aã]o|despacho|decis[aã]o|senten[cç]a|prazo\s+de\s+\d+|audi[eê]ncia|publicad[oa]\s+(?:em|no)|movimenta[cç][aã]o\s+processual|carta\s+de\s+ordem/i;

// CNJ solto no texto (com ou sem máscara), com bordas estritas.
const CNJ_NO_TEXTO = /(?<![\d.\-/])\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}(?![\d])/g;

// "processo nº 5618319.57", "autos 5618319.57", "proc. 5618319.57": o contexto que torna aceitável
// um número curto (que sozinho parece valor, versão ou IP).
const CONTEXTO_DO_NUMERO_CURTO = /(?:processo|proc\.|autos|n[ºo°]\.?)\s*:?\s*$/i;

export type RegrasDoEscritorio = { permitir: string[]; negar: string[] };

export type EntradaEmail = {
  from: string; // endereço, minúsculo
  fromName?: string | null;
  subject: string;
  text: string;
  // Cabeçalhos relevantes, já lidos (minúsculos). Ausente = não veio.
  cabecalhos?: { lumen?: boolean; autoSubmitted?: string | null; precedence?: string | null; listUnsubscribe?: boolean };
  // Endereços que o próprio Lúmen usa para enviar (EMAIL_USER etc.).
  enderecosDoSistema?: string[];
  regras?: RegrasDoEscritorio;
  // Dado o número (qualquer formato), o escritório tem esse processo cadastrado?
  processoCadastrado?: (numero: string) => boolean;
};

export type DecisaoEmail =
  | { acao: "RECUSAR"; motivo: string }
  | { acao: "QUARENTENA"; motivo: string; numero: string | null }
  | { acao: "ACEITAR"; motivo: string; numero: string; origemNaoReconhecida: boolean };

function dominioDe(endereco: string): string {
  const i = endereco.lastIndexOf("@");
  return i >= 0 ? endereco.slice(i) : "";
}

/** Regra por endereço completo ou por domínio ("@dominio.com"); o endereço completo é mais específico. */
function casaRegra(endereco: string, padrao: string): "endereco" | "dominio" | null {
  const p = padrao.trim().toLowerCase();
  if (!p) return null;
  if (p === endereco) return "endereco";
  if (p.startsWith("@") && (dominioDe(endereco) === p || dominioDe(endereco).endsWith(`.${p.slice(1)}`))) return "dominio";
  return null;
}

export function ehRemetenteDeTribunal(endereco: string): boolean {
  const e = endereco.toLowerCase();
  if (REMETENTES_DE_TRIBUNAL_E_JUSBRASIL.includes(e)) return true;
  const dom = dominioDe(e);
  return /\.jus\.br$/.test(dom) || dom.endsWith("@jusbrasil.com.br") || SISTEMA_DE_TRIBUNAL_NO_ENDERECO.test(e);
}

function ehPontoProjudi(endereco: string, assunto: string): boolean {
  return /projudi|tjgo\.jus\.br/i.test(endereco) || /projudi/i.test(assunto);
}

// Texto sem as linhas citadas ("> ...") de uma resposta encadeada: o número que só aparece numa
// citação não é o assunto da mensagem.
function semCitacoes(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
}

export type NumeroEncontrado = { numero: string; tipo: "CNJ" | "CURTO" | "CNJ_INVALIDO" };

/** Primeiro número de processo utilizável no assunto ou no corpo, ou null. */
export function acharNumeroDeProcesso(assunto: string, corpo: string, opcoes: { remetenteProjudi: boolean }): NumeroEncontrado | null {
  const texto = `${assunto}\n${semCitacoes(corpo)}`;
  let invalido: NumeroEncontrado | null = null;
  for (const m of texto.matchAll(CNJ_NO_TEXTO)) {
    if (cnjValido(m[0])) return { numero: m[0], tipo: "CNJ" };
    invalido ??= { numero: m[0], tipo: "CNJ_INVALIDO" };
  }
  if (opcoes.remetenteProjudi) {
    // Procura o número curto com o contexto "processo/nº/autos" imediatamente antes.
    const re = /(?<![\d.,/\-])(\d{7})\.(\d{2})(?![\d.,/\-]?\d)/g;
    for (const m of texto.matchAll(re)) {
      const antes = texto.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
      if (CONTEXTO_DO_NUMERO_CURTO.test(antes)) return { numero: `${m[1]}.${m[2]}`, tipo: "CURTO" };
    }
    const solto = numeroCurtoNoTexto(texto);
    if (solto && !invalido) return { numero: solto, tipo: "CURTO" };
  }
  return invalido;
}

export function decidirEmail(e: EntradaEmail): DecisaoEmail {
  const from = (e.from || "").toLowerCase();
  const regras = e.regras ?? { permitir: [], negar: [] };

  // ---- 0. Recusa dura ----
  if (e.cabecalhos?.lumen) return { acao: "RECUSAR", motivo: "e-mail enviado pelo próprio Lúmen (cabeçalho X-Lumen-Notificacao)" };
  if (from && (e.enderecosDoSistema ?? []).some((s) => s.toLowerCase() === from)) return { acao: "RECUSAR", motivo: "e-mail enviado pelo endereço do sistema" };
  if (/^l[uú]men$/i.test((e.fromName ?? "").trim())) return { acao: "RECUSAR", motivo: "e-mail enviado em nome do Lúmen" };
  if (e.subject.includes("{{")) return { acao: "RECUSAR", motivo: "assunto de modelo do Lúmen com variável sem preencher" };

  const permitida = regras.permitir.map((p) => casaRegra(from, p)).filter(Boolean) as ("endereco" | "dominio")[];
  const negada = regras.negar.map((p) => casaRegra(from, p)).filter(Boolean) as ("endereco" | "dominio")[];
  const sistemaNegado = REMETENTES_NEGADOS_DO_SISTEMA.some((p) => casaRegra(from, p));
  // PERMITIR por endereço vence qualquer NEGAR; senão NEGAR (do escritório ou do sistema) vence.
  const permitidoPorEndereco = permitida.includes("endereco");
  if (!permitidoPorEndereco && (negada.length > 0 || (sistemaNegado && permitida.length === 0))) {
    return { acao: "RECUSAR", motivo: negada.length > 0 ? "remetente bloqueado pelo escritório" : "remetente de sistema que não envia publicações" };
  }

  const tribunal = ehRemetenteDeTribunal(from) || permitida.length > 0;
  const emMassa =
    /^(bulk|junk|list)$/i.test((e.cabecalhos?.precedence ?? "").trim()) || (Boolean(e.cabecalhos?.listUnsubscribe) && !tribunal);
  if (emMassa && !tribunal) return { acao: "RECUSAR", motivo: "mensagem em massa/lista de remetente que não é de tribunal" };

  // ---- 1. Número de processo ----
  const achado = acharNumeroDeProcesso(e.subject, e.text, { remetenteProjudi: ehPontoProjudi(from, e.subject) });
  if (!achado) return { acao: "RECUSAR", motivo: "sem número de processo no assunto nem no corpo" };
  if (achado.tipo === "CNJ_INVALIDO") {
    return { acao: "QUARENTENA", motivo: "número de processo com dígito verificador inválido", numero: achado.numero };
  }

  // ---- 2. Remetente de confiança ----
  if (tribunal) return { acao: "ACEITAR", motivo: ehRemetenteDeTribunal(from) ? "remetente de tribunal ou do Jusbrasil" : "remetente permitido pelo escritório", numero: achado.numero, origemNaoReconhecida: false };

  // ---- 3. Remetente desconhecido: só entra na fila se o processo é nosso e o texto é de intimação ----
  const cadastrado = e.processoCadastrado ? e.processoCadastrado(achado.numero) : false;
  if (cadastrado && MARCADOR_JUDICIAL_FORTE.test(`${e.subject}\n${e.text}`)) {
    return { acao: "ACEITAR", motivo: "processo cadastrado com texto de intimação; remetente desconhecido", numero: achado.numero, origemNaoReconhecida: true };
  }

  // ---- 4. O resto, com número válido, espera decisão de uma pessoa ----
  return { acao: "QUARENTENA", motivo: "número de processo válido, mas remetente desconhecido", numero: achado.numero };
}

/** Chave estável do número achado (CNJ ou curto), para casar com Case e com bloqueios. */
export function chaveDoNumeroAchado(numero: string): string | null {
  return chaveDoProcesso(numero) ?? (normalizarCnj(numero) ? `CNJ:${normalizarCnj(numero)}` : null);
}

/** Endereço do remetente em minúsculo, a partir de "Nome <a@b.com>" ou "a@b.com". */
export function enderecoDoRemetente(valor: string | null | undefined): string {
  if (!valor) return "";
  const m = /<([^>]+)>/.exec(valor);
  return (m ? m[1] : valor).trim().toLowerCase();
}
