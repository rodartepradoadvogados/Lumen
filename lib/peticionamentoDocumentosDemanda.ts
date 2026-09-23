// Agrupamento POR DEMANDA da lista de documentos da tela de Documentos do Peticionamento —
// módulo PURO (sem prisma, sem React) para poder ser exercitado de mesa em
// lib/testes/peticionamentoDocumentos.teste.ts. `demanda` já vem calculada em
// listarDocumentosDoVinculo (lib/actions/peticionamento.ts, documentosDasAssessorias): aqui só se
// decide COMO desenhar a partir do rótulo já pronto, nunca de onde ele vem.
//
// Regra do produto (pedido do dono, 23/09/2026 — "quando chego em assessoria, não consigo entrar
// nas demandas que criei... como eu já consigo fazer em processos"): documento de processo/
// atendimento vinculado DIRETO à sessão, e documento GERAL de uma assessoria (sem Processo,
// Atendimento, Licitação ou Parecer por trás), ficam SOLTOS — a mesma lista plana que a tela já
// mostrava antes desta entrega. Documento de uma demanda (Processo, Atendimento, Licitação ou
// Parecer) DENTRO de uma assessoria ganha um grupo com o nome dela. Nunca um nível a mais que
// este: "accordion dentro de accordion" foi pedido explícito do dono para NÃO fazer na aba de
// Licitações da Assessoria (ver components/assessoria/AssessoriaLicitacoesTab.tsx) — a mesma
// régua vale aqui.
//
// Ordem preservada: a primeira vez que uma demanda aparece na lista de entrada decide a posição
// do grupo dela na saída (nunca reordenada por nome) — a lista de entrada já vem ordenada por
// createdAt desc (mais recente primeiro), e reordenar aqui bagunçaria isso sem necessidade.

export type DocumentoParaAgrupar = { demanda: string | null };

export type DocumentosAgrupados<T> = { soltos: T[]; grupos: [string, T[]][] };

export function agruparDocumentosPorDemanda<T extends DocumentoParaAgrupar>(documentos: T[]): DocumentosAgrupados<T> {
  const soltos: T[] = [];
  const porDemanda = new Map<string, T[]>();
  const ordemDosGrupos: string[] = [];

  for (const doc of documentos) {
    if (!doc.demanda) {
      soltos.push(doc);
      continue;
    }
    if (!porDemanda.has(doc.demanda)) {
      porDemanda.set(doc.demanda, []);
      ordemDosGrupos.push(doc.demanda);
    }
    porDemanda.get(doc.demanda)!.push(doc);
  }

  return { soltos, grupos: ordemDosGrupos.map((nome): [string, T[]] => [nome, porDemanda.get(nome)!]) };
}
