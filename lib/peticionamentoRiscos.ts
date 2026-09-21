// A NOTA DE RISCOS IDENTIFICADOS — decisão do dono (item 6 das seis mudanças, decisions.md §9):
// separada da nota obrigatória, aponta e sugere, NUNCA prognostica. decisions.md §10 é explícito
// que a linha entre "prosa jurídica confiante" e "afirmar chance de êxito" não é nítida para um
// modelo de linguagem, e que um filtro por palavra-chave "pega os casos óbvios e deixa passar os
// sutis". Este módulo é EXATAMENTE esse filtro — uma segunda linha de defesa, não uma garantia:
// pega o óbvio (prognóstico explícito, percentual, "certamente"/"dificilmente") e barra antes de
// entrar na peça; o sutil continua exigindo revisão humana amostral do perfil, como o próprio
// decisions.md recomenda.
//
// Módulo PURO — recebe as frases que o Hermes propôs como risco e devolve só as que passam no
// crivo mecânico, mais o motivo de cada corte (nunca cortado em silêncio — o registro de auditoria
// consegue mostrar o que foi descartado e por quê).

// Padrões que cruzam a linha "aponta → decide/prognostica" (contrato-com-o-agente.md §3,
// coluna "não pode dizer"). Case-insensitive; cobre português com e sem acento onde plausível.
const PADROES_PROIBIDOS: { regex: RegExp; motivo: string }[] = [
  { regex: /\b\d{1,3}\s?%/, motivo: "contém percentual — parece estimativa de chance" },
  { regex: /\bchance(s)?\s+de\b/i, motivo: 'contém "chance de" — afirma probabilidade de êxito' },
  { regex: /\bprovável|provavelmente\b/i, motivo: 'contém "provável/provavelmente" — prognóstico' },
  { regex: /\bdificilmente\b/i, motivo: 'contém "dificilmente" — prognóstico' },
  { regex: /\bcertamente|com certeza\b/i, motivo: 'contém "certamente/com certeza" — afirmação fechada' },
  { regex: /\bgarant(e|ido|ida|imos)\b/i, motivo: 'contém "garante/garantido" — afirmação fechada' },
  { regex: /\btipo\s+de\s+peça\s+correto\b/i, motivo: "decide o tipo de peça correto em vez de só apontar" },
  { regex: /\bdeveria\s+substituir\b/i, motivo: "decide substituir a estratégia em vez de só sugerir" },
];

export type AvaliacaoDeRisco = { texto: string; aceito: boolean; motivoRejeicao: string | null };

/** Uma frase — devolve se ela pode entrar na nota de riscos como está. */
export function avaliarFraseDeRisco(texto: string): AvaliacaoDeRisco {
  for (const padrao of PADROES_PROIBIDOS) {
    if (padrao.regex.test(texto)) {
      return { texto, aceito: false, motivoRejeicao: padrao.motivo };
    }
  }
  return { texto, aceito: true, motivoRejeicao: null };
}

export type ResultadoFiltroDeRiscos = {
  aceitas: string[];
  rejeitadas: { texto: string; motivo: string }[];
};

/**
 * Filtra a lista inteira. Usada pela Server Action logo depois de receber a resposta do Hermes,
 * antes de gravar `PeticionamentoSessao.notaRiscos` — nunca grava o que este filtro rejeitou.
 */
export function filtrarNotaDeRiscos(frases: string[]): ResultadoFiltroDeRiscos {
  const aceitas: string[] = [];
  const rejeitadas: { texto: string; motivo: string }[] = [];
  for (const frase of frases) {
    const avaliacao = avaliarFraseDeRisco(frase);
    if (avaliacao.aceito) aceitas.push(avaliacao.texto);
    else rejeitadas.push({ texto: avaliacao.texto, motivo: avaliacao.motivoRejeicao! });
  }
  return { aceitas, rejeitadas };
}

/**
 * Quando a sessão passou por resumo automático de contexto (contexto-excedido.html, estado
 * "resumido"), decisions.md §10 pede que qualquer observação de "ausência de algo nos autos"
 * diga isso explicitamente — o corte pode ter escondido justamente o trecho que provaria o
 * contrário. Acrescenta o aviso a toda frase de risco quando a sessão teve resumo.
 */
export function comAvisoDeContextoResumido(frases: string[], contextoFoiResumido: boolean): string[] {
  if (!contextoFoiResumido) return frases;
  return frases.map((f) => `${f} (parte do contexto desta sessão foi resumida automaticamente — esta observação pode estar incompleta.)`);
}
