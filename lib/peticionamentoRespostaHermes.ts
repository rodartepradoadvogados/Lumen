// SEPARA a resposta do Hermes (texto com os marcadores pedidos por lib/peticionamentoPrompt.ts)
// em corpo/jurisprudência/riscos/documentos. Módulo PURO, tolerante: um Hermes que não seguiu o
// formato à risca NUNCA derruba a geração — o texto inteiro vira `corpo` e as demais listas saem
// vazias, com um aviso de análise (nunca falha em silêncio, nunca lança exceção para algo que é
// só "o modelo respondeu diferente do pedido").

import { MARCADORES_RESPOSTA_HERMES as M } from "@/lib/peticionamentoPrompt";
import type { PrecedenteCitado } from "@/lib/peticionamentoNotaObrigatoria";

export type RespostaHermesEstruturada = {
  corpo: string;
  jurisprudencia: PrecedenteCitado[];
  riscos: string[];
  documentosUsados: string[];
  tipoPecaInferido: string | null;
  /** true quando algum marcador esperado não foi encontrado — sinal para auditoria, nunca bloqueia. */
  formatoInesperado: boolean;
};

function extrairSecao(texto: string, marcadorAtual: string, todosMarcadores: string[]): string | null {
  const inicio = texto.indexOf(marcadorAtual);
  if (inicio === -1) return null;
  const depoisDoMarcador = inicio + marcadorAtual.length;
  let fim = texto.length;
  for (const outro of todosMarcadores) {
    if (outro === marcadorAtual) continue;
    const idx = texto.indexOf(outro, depoisDoMarcador);
    if (idx !== -1 && idx < fim) fim = idx;
  }
  return texto.slice(depoisDoMarcador, fim).trim();
}

function linhasNaoVazias(secao: string | null): string[] {
  if (!secao) return [];
  return secao
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("("));
}

export function interpretarRespostaHermes(textoBruto: string): RespostaHermesEstruturada {
  const todosMarcadores = [M.corpo, M.jurisprudencia, M.riscos, M.documentos, M.tipoPecaInferido];
  const corpoSecao = extrairSecao(textoBruto, M.corpo, todosMarcadores);

  if (corpoSecao === null) {
    // O Hermes não usou o formato pedido — trata a resposta inteira como corpo. Melhor uma
    // minuta sem a estrutura ideal do que nenhuma minuta.
    return { corpo: textoBruto.trim(), jurisprudencia: [], riscos: [], documentosUsados: [], tipoPecaInferido: null, formatoInesperado: true };
  }

  const jurisprudenciaLinhas = linhasNaoVazias(extrairSecao(textoBruto, M.jurisprudencia, todosMarcadores));
  const jurisprudencia: PrecedenteCitado[] = jurisprudenciaLinhas.map((linha) => {
    const [texto, fonte] = linha.split("||").map((p) => p.trim());
    return { texto: texto || linha, fonte: fonte || null };
  });

  const riscos = linhasNaoVazias(extrairSecao(textoBruto, M.riscos, todosMarcadores));
  const documentosUsados = linhasNaoVazias(extrairSecao(textoBruto, M.documentos, todosMarcadores));
  const tipoPecaInferidoSecao = extrairSecao(textoBruto, M.tipoPecaInferido, todosMarcadores);
  const tipoPecaInferido = tipoPecaInferidoSecao && !tipoPecaInferidoSecao.startsWith("(") ? tipoPecaInferidoSecao.split("\n")[0].trim() || null : null;

  return {
    corpo: corpoSecao,
    jurisprudencia,
    riscos,
    documentosUsados,
    tipoPecaInferido,
    formatoInesperado: false,
  };
}
