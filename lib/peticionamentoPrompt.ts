// MONTA A MENSAGEM enviada ao Hermes (perfil peticionamento-lumen) — o "pacote de contexto" que
// contrato-com-o-agente.md §1 descreve. Módulo PURO: recebe dados já resolvidos (nunca consulta
// Prisma) e devolve uma string. Pede a resposta num formato com MARCADORES fixos
// (###CORPO###/###JURISPRUDENCIA###/...) para que lib/peticionamentoRespostaHermes.ts consiga
// separar corpo, jurisprudência, riscos e documentos de forma confiável — sem isso, a nota
// obrigatória (que É construída por código, nunca copiada do texto livre do modelo — ver
// lib/peticionamentoNotaObrigatoria.ts) não teria como saber quais precedentes o texto usou.
//
// As TRAVAS (nunca protocolar, nunca afirmar chance de êxito, sempre citar fonte, nunca decidir
// sozinho a estratégia) vão na mensagem como reforço de prompt — a especificação §3 já é
// explícita que isso é complemento, NUNCA o hard gate em si (o hard gate é código: ver
// lib/peticionamentoFecho.ts, lib/peticionamentoNotaObrigatoria.ts, lib/peticionamentoRiscos.ts,
// e a ausência total de qualquer chamada de protocolo em todo este módulo).

export type DadosParaPrompt = {
  materia: string;
  tipoPeca: string | null;
  tipoPecaOutro: string | null;
  contextoDescricao: string | null; // null = sessão avulsa
  fatos: string;
  pedidos: string[];
  teses: string[];
  observacoes: string | null;
  documentos: { nome: string; texto: string }[];
  contextoFoiResumido: boolean;
  avisoDeResumo: string | null;
};

const MARCADORES = {
  corpo: "###CORPO###",
  jurisprudencia: "###JURISPRUDENCIA###",
  riscos: "###RISCOS###",
  documentos: "###DOCUMENTOS###",
  tipoPecaInferido: "###TIPO_PECA_INFERIDO###",
} as const;

export { MARCADORES as MARCADORES_RESPOSTA_HERMES };

export function montarMensagemParaHermes(dados: DadosParaPrompt): string {
  const partes: string[] = [];

  partes.push(
    "Você é o agente de peticionamento do Lúmen (perfil peticionamento-lumen). Redija uma minuta " +
      "de petição COMPLETA, em rascunho — nunca pronta para protocolar sem revisão. Regras que " +
      "NUNCA podem ser quebradas nesta resposta:",
  );
  partes.push("- Nunca afirme chance ou probabilidade de êxito, nem prognostique o resultado do caso.");
  partes.push("- Toda jurisprudência citada precisa vir com fonte real (tribunal/link) — nunca invente número de processo, ementa ou Tema. Se não tiver certeza de que um precedente existe exatamente como descrito, não cite: descreva a tese sem número, ou diga que precisa ser localizada e conferida.");
  partes.push("- Nunca decida sozinho a estratégia processual — aponte bifurcações e observações, a decisão é do advogado.");
  partes.push('- Nunca sugira ou insinue que a peça será protocolada por você — protocolar é sempre ato humano, fora deste sistema.');
  partes.push('- O fecho da peça é EXATAMENTE "Termos em que pede deferimento." — sem vírgula depois de "que".');

  partes.push("");
  partes.push(`Matéria: ${dados.materia}`);
  partes.push(`Tipo de peça: ${dados.tipoPeca ?? "(não informado — infira pelo contexto vinculado, se houver, e diga que inferiu)"}${dados.tipoPecaOutro ? ` (${dados.tipoPecaOutro})` : ""}`);
  partes.push(`Contexto vinculado: ${dados.contextoDescricao ?? "sem vínculo — petição avulsa"}`);
  partes.push(`Fatos (texto do advogado): ${dados.fatos}`);
  if (dados.pedidos.length > 0) partes.push(`Pedidos a reiterar/formular: ${dados.pedidos.join("; ")}`);
  if (dados.teses.length > 0) partes.push(`Teses já marcadas pelo advogado: ${dados.teses.join("; ")}`);
  if (dados.observacoes) partes.push(`Observações adicionais do advogado: ${dados.observacoes}`);

  if (dados.documentos.length > 0) {
    partes.push("");
    partes.push("Documentos disponíveis nesta sessão:");
    for (const doc of dados.documentos) {
      partes.push(`--- ${doc.nome} ---`);
      partes.push(doc.texto);
    }
  }

  if (dados.contextoFoiResumido && dados.avisoDeResumo) {
    partes.push("");
    partes.push(`ATENÇÃO: parte do contexto acima foi resumida automaticamente por exceder o limite. ${dados.avisoDeResumo} Qualquer observação sua sobre "ausência de algo nos autos" deve dizer que se baseia em contexto parcialmente resumido.`);
  }

  partes.push("");
  partes.push("Responda EXATAMENTE neste formato, com estes marcadores literais (omita um marcador só quando a seção correspondente estiver vazia; nunca omita o CORPO):");
  partes.push(MARCADORES.corpo);
  partes.push("(o texto completo da petição, do endereçamento ao fecho)");
  partes.push(MARCADORES.jurisprudencia);
  partes.push("(uma linha por precedente citado, no formato: texto do precedente || url da fonte — ou deixe esta seção vazia se nenhum precedente foi citado)");
  partes.push(MARCADORES.riscos);
  partes.push("(uma linha por risco identificado — cada frase apontando algo, nunca decidindo ou prognosticando; deixe vazio se nada a apontar)");
  partes.push(MARCADORES.documentos);
  partes.push("(uma linha por documento efetivamente usado para redigir — nomes exatamente como informados acima)");
  if (!dados.tipoPeca) {
    partes.push(MARCADORES.tipoPecaInferido);
    partes.push("(o tipo de peça que você inferiu do contexto, ou deixe vazio se não deu para inferir)");
  }

  return partes.join("\n");
}
