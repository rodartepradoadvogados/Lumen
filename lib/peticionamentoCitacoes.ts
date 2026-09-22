// A LISTA DE VALIDAÇÃO DE CITAÇÕES, uma a uma — decisão do dono (22/09/2026). Dois grupos:
//
//   1. EMENTAS CITADAS — o precedente que o agente estruturou como tal (jurisprudenciaCitada,
//      vindo de lib/peticionamentoRespostaHermes.ts).
//   2. TRECHOS NÃO COLOCADOS COMO EMENTA — qualquer outra referência a julgado, súmula ou tema
//      solta no CORPO da minuta, sem ter sido estruturada. "São os mais perigosos, porque hoje
//      escapam inteiros da lista de jurisprudência" (palavras do dono) — é a parte difícil desta
//      entrega, e por isso o cuidado extra com os casos estranhos abaixo.
//
// Módulo PURO: só string/array, nenhum Prisma. Quem grava PeticionamentoCitacao é
// lib/actions/peticionamento.ts (sincronizarCitacoes) — este módulo só CALCULA a lista, nunca
// decide o que fazer com o banco.

import { createHash } from "node:crypto";

export type TipoDeCitacao = "EMENTA" | "TRECHO";

export type CitacaoExtraida = {
  tipo: TipoDeCitacao;
  texto: string;
  fonteUrl: string | null;
  fonteSecundariaUrl: string | null;
};

/** O formato que lib/peticionamentoRespostaHermes.ts produz para cada linha de jurisprudência. */
export type PrecedenteParaCitacao = { texto: string; fonte: string | null; fonteSecundaria?: string | null };

/**
 * Normaliza espaço/quebra de linha/caixa para uma forma comparável — usado tanto para achar uma
 * ementa já embutida no corpo quanto para a IDENTIDADE de uma citação entre uma sincronização e a
 * seguinte (ver hashDeTexto). Nunca usado para o que é MOSTRADO na tela — lá o texto original.
 */
export function normalizarTextoCitacao(texto: string): string {
  return texto.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A impressão do texto no momento da confirmação (PeticionamentoCitacao.hashDoTexto, schema:
 * "se o texto mudar, a confirmação não vale mais"). Um hash da forma NORMALIZADA — não da string
 * bruta — para não invalidar uma confirmação por causa de um espaço a mais ou uma quebra de linha
 * que o realinhamento do texto introduziu, só quando o CONTEÚDO da citação de fato mudou.
 */
export function hashDeTexto(texto: string): string {
  return createHash("sha256").update(normalizarTextoCitacao(texto)).digest("hex");
}

function extrairEmentas(precedentes: PrecedenteParaCitacao[]): CitacaoExtraida[] {
  return precedentes
    .filter((p) => typeof p?.texto === "string" && p.texto.trim().length > 0)
    .map((p) => ({
      tipo: "EMENTA" as const,
      texto: p.texto.trim(),
      fonteUrl: p.fonte ?? null,
      fonteSecundariaUrl: p.fonteSecundaria ?? null,
    }));
}

// ── PADRÕES DE TRECHO SOLTO ──────────────────────────────────────────────────────────────────
//
// `\s*` (que em JS casa espaço E quebra de linha) entre cada separador de propósito: o corpo da
// minuta pode quebrar linha logo depois de um "-" ou um "." — pontos naturais de quebra de texto
// corrido — e um número de processo partido em duas linhas não pode escapar por causa disso.

/** Número de processo CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO — com tolerância a quebra de linha em cada separador. */
const RE_PROCESSO_CNJ = /\d{7}\s*-\s*\d{2}\s*\.\s*\d{4}\s*\.\s*\d\s*\.\s*\d{2}\s*\.\s*\d{4}/g;

// Súmula — inclusive quando a palavra "súmula" NEM APARECE: "enunciado", "verbete (sumular)" e a
// abreviação "SV" (Súmula Vinculante) são formas correntes de citar sem usar a palavra inteira.
const RE_SUMULA = /\b(s[uú]mula(\s+vinculante)?|s[uú]m\.|enunciado(\s+sumular)?|verbete(\s+sumular)?|sv)\b\s*n?[ºo°:.]*\s*\d+/gi;

const RE_TEMA = /\btema\b\s*n?[ºo°:.]*\s*\d+/gi;

// Recursos/ações e o número/registro que os acompanha — sufixo aceita dígitos e ponto (grupos de
// milhar, "1.874.782") com um UF opcional no fim ("/SP"). NUNCA um "\d...\d" fechando em dígito
// obrigatório: isso força o motor a fazer backtracking e cortar o "/SP" fora do trecho capturado
// (achado testando o próprio caso "REsp 1.874.782/SP" — o "/SP" sumia da citação mostrada).
const RE_RECURSO = /\b(AREsp|EAREsp|REsp|ADPF|ADC|ADI|RHC|RMS|AgRg|AgInt|EDcl|ARE|RE|HC|MS|Ag)\b\.?\s*n?[ºo°:.]*\s*\d[\d.]*(?:\/[A-Za-z]{2})?/g;

const PADROES = [RE_PROCESSO_CNJ, RE_SUMULA, RE_TEMA, RE_RECURSO];

type Ocorrencia = { inicio: number; fim: number };

function encontrarOcorrencias(texto: string): Ocorrencia[] {
  const ocorrencias: Ocorrencia[] = [];
  for (const padrao of PADROES) {
    // Cópia nova a cada padrão: um regex `g` guarda `lastIndex` na própria instância, e reusar o
    // módulo (const compartilhada) entre chamadas sucessivas desta função corromperia a varredura
    // da segunda chamada em diante — bug clássico de regex global reaproveitado.
    const re = new RegExp(padrao.source, padrao.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      ocorrencias.push({ inicio: m.index, fim: m.index + m[0].length });
    }
  }
  ocorrencias.sort((a, b) => a.inicio - b.inicio);

  // Funde ocorrências vizinhas: "REsp 1.234.567/SP (Tema 990)" acende o padrão de recurso E o de
  // tema, lado a lado — sem fundir, a mesma citação viraria dois itens fragmentados na lista. O
  // limite é PEQUENO de propósito: só cobre a pontuação entre dois identificadores da MESMA
  // citação (", ", " (", "/"), nunca a prosa entre duas citações genuinamente diferentes (ex.:
  // "o Tema 990 e também a Súmula 297" tem bem mais que isso entre as duas).
  const GAP_MAXIMO = 6;
  const fundidas: Ocorrencia[] = [];
  for (const oc of ocorrencias) {
    const ultima = fundidas[fundidas.length - 1];
    if (ultima && oc.inicio - ultima.fim <= GAP_MAXIMO) {
      ultima.fim = Math.max(ultima.fim, oc.fim);
    } else {
      fundidas.push({ ...oc });
    }
  }
  return fundidas;
}

/**
 * Os trechos soltos: varre o corpo da minuta ATRÁS das ementas já estruturadas (removidas
 * primeiro, por ocorrência LITERAL — é o caso mais comum, o agente costuma reproduzir a ementa
 * dentro da argumentação) e devolve cada referência encontrada no que sobrou, uma vez por texto
 * distinto (a mesma citação repetida duas vezes no corpo vira UM item — confirmar uma vez cobre
 * as duas aparições).
 *
 * DECISÃO DELIBERADA: quando uma ementa aparece no corpo de forma PARAFRASEADA (não literal), a
 * remoção acima não a encontra, e um número/tema que também está na ementa pode aparecer aqui de
 * novo como "trecho". Prefere-se o risco de mostrar a mesma citação duas vezes (uma confirmação a
 * mais, inofensiva) ao risco oposto — matar por engano um trecho que não é, de fato, o mesmo da
 * ementa. É a mesma lógica do "mais perigoso é deixar escapar" que motivou esta entrega.
 */
export function extrairTrechosSoltos(minutaTexto: string | null | undefined, ementas: CitacaoExtraida[]): CitacaoExtraida[] {
  if (!minutaTexto) return [];

  let semEmentas = minutaTexto;
  for (const e of ementas) {
    if (e.texto && semEmentas.includes(e.texto)) semEmentas = semEmentas.split(e.texto).join(" ");
  }

  const ocorrencias = encontrarOcorrencias(semEmentas);
  const vistos = new Set<string>();
  const trechos: CitacaoExtraida[] = [];
  for (const { inicio, fim } of ocorrencias) {
    const bruto = semEmentas.slice(inicio, fim).trim();
    if (!bruto) continue;
    const chave = normalizarTextoCitacao(bruto);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    // Fonte SEMPRE null aqui: um trecho solto não veio estruturado pelo Hermes, então não existe
    // link de dupla validação para ele — e essa ausência é um FATO a mostrar na tela, nunca um
    // silêncio (mesma régua do schema para EMENTA sem fonte).
    trechos.push({ tipo: "TRECHO", texto: bruto, fonteUrl: null, fonteSecundariaUrl: null });
  }
  return trechos;
}

/** A lista completa — ementas primeiro, trechos soltos depois. */
export function montarListaDeCitacoes(dados: { jurisprudenciaCitada: PrecedenteParaCitacao[] | null | undefined; minutaTexto: string | null | undefined }): CitacaoExtraida[] {
  const ementas = extrairEmentas(dados.jurisprudenciaCitada ?? []);
  const trechos = extrairTrechosSoltos(dados.minutaTexto, ementas);
  return [...ementas, ...trechos];
}
