// CLASSIFICAÇÃO DO ATO — o que o item da fila É, antes de falar em prazo. Módulo PURO.
//
// O defeito que isto corrige (12/10/2026): o e-mail do Projudi de Goiás ("[PROJUDI]Informação de
// intimação/citação") diz só que há uma intimação/citação esperando na caixa de entrada do
// sistema. Não traz o ato nem o prazo, e traz o rodapé "Esta mensagem não possui valor legal".
// Era gravado como ANDAMENTO e a tela afirmava "Só ciência: andamento sem prazo no texto" — um
// convite a arquivar uma intimação que ninguém abriu. São 158 avisos em produção, 155 abertos.
//
// O prazo de uma intimação eletrônica corre da CONSULTA ou, sem consulta, do fim de 10 dias
// corridos do envio (Lei 11.419/2006, art. 5º, §§ 1º e 3º). O Lúmen mostra "abrir até dd/mm" como
// ESTIMATIVA e manda confirmar no sistema do tribunal: as regras próprias de cada tribunal não são
// verificadas aqui.

import { saoPauloDayKey } from "@/lib/publicationGrouping";

export type TipoAto = "AVISO_INTIMACAO" | "INTIMACAO" | "MOVIMENTACAO";

// "está disponível uma intimação/citação", "Informação de intimação/citação" e "caixa de entrada no
// Sistema PROJUDI" são as três marcas do aviso; qualquer uma, em texto curto, basta.
const MARCAS_DO_AVISO = [
  /dispon[ií]vel\s+(?:uma\s+)?(?:intima[cç][aã]o|cita[cç][aã]o|notifica[cç][aã]o)/i,
  /informa[cç][aã]o\s+de\s+intima[cç][aã]o\s*\/?\s*cita[cç][aã]o/i,
  /em\s+sua\s+caixa\s+de\s+entrada\s+n[oa]\s+sistema/i,
];

// Um aviso é uma frase; um ato de verdade tem teor. Acima disto, não é aviso.
const TAMANHO_MAXIMO_DO_AVISO = 900;

const SISTEMA_DE_TRIBUNAL = /projudi|e-?proc|pje|e-?saj|esaj/i;

export function ehAvisoDeIntimacao(p: { source: string; content: string; emailSubject?: string | null }): boolean {
  const texto = p.content ?? "";
  if (texto.length > TAMANHO_MAXIMO_DO_AVISO) return false;
  if (!SISTEMA_DE_TRIBUNAL.test(`${p.source} ${p.emailSubject ?? ""}`)) return false;
  return MARCAS_DO_AVISO.some((re) => re.test(texto) || re.test(p.emailSubject ?? ""));
}

export function tipoDoAto(p: { source: string; kind: string; content: string; emailSubject?: string | null }): TipoAto {
  if (ehAvisoDeIntimacao(p)) return "AVISO_INTIMACAO";
  return p.kind === "PUBLICACAO" ? "INTIMACAO" : "MOVIMENTACAO";
}

// Dias corridos do envio do aviso até a intimação se considerar realizada sem consulta.
export const DIAS_PARA_ABRIR_O_AVISO = 10;

/** `AAAA-MM-DD` do último dia para abrir o aviso, contando do dia (Brasília) do envio. Estimativa. */
export function limiteParaAbrirOAviso(enviadoEm: string | Date): string {
  const dia = saoPauloDayKey(enviadoEm);
  const [a, m, d] = dia.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m - 1, d + DIAS_PARA_ABRIR_O_AVISO));
  return fim.toISOString().slice(0, 10);
}
