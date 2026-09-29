// Regras PURAS (sem prisma, sem React) de QUAIS documentos pertencem a uma sessão de
// peticionamento — exercitadas de verdade em lib/testes/peticionamentoDocumentosDaSessao.teste.ts.
//
// Por que existe (PR P0, 29/09/2026): a lista da tela de Documentos mistura ids de duas tabelas —
// `Attachment` (documento de processo/atendimento/licitação) e `AssessoriaDocumento` (documento
// próprio da assessoria: parecer, contrato, regimento). Marcar um AssessoriaDocumento gravava o id
// em `documentosExistentesIds`, mas a geração da minuta só lia `Attachment`: o documento marcado
// nunca chegava ao prompt e a tela não dava erro nenhum. E `definirDocumentosSelecionados`
// gravava QUALQUER id, inclusive de outro escritório.

/** Teto de ids numa gravação — a tela mais cheia do plano tem dezenas; centenas já é abuso. */
export const LIMITE_DE_DOCUMENTOS_SELECIONADOS = 1000;

/**
 * Ids únicos, na ordem em que vieram, só strings não vazias. Nunca confia no que o cliente manda:
 * `definirDocumentosSelecionados` é uma server action, chamável com qualquer array.
 */
export function normalizarIdsSelecionados(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0 || vistos.has(id)) continue;
    vistos.add(id);
    saida.push(id);
  }
  return saida;
}

/**
 * Dos ids pedidos, quais NÃO foram achados entre os documentos DESTE escritório
 * (`encontradosNoEscritorio` = união do que Attachment e AssessoriaDocumento devolveram com
 * `officeId` no próprio `where`). Não vazio = alguém tentou marcar documento alheio ou inexistente.
 */
export function idsForaDoEscritorio(pedidos: string[], encontradosNoEscritorio: Iterable<string>): string[] {
  const achados = new Set(encontradosNoEscritorio);
  return pedidos.filter((id) => !achados.has(id));
}

export type DocumentoBaixavel = { id: string; nome: string; driveUrl: string | null };

/**
 * A lista final de documentos que a geração vai baixar e ler: Attachment marcados, AssessoriaDocumento
 * marcados e anexos novos da sessão — nesta ordem, sem repetir id (o mesmo id nunca existe nas duas
 * tabelas na prática — são cuid —, mas a lista não deve depender disso para não duplicar texto no prompt).
 */
export function unirDocumentosDaSessao(
  attachments: { id: string; name: string; driveUrl: string | null }[],
  documentosDaAssessoria: { id: string; name: string; driveUrl: string | null }[],
  anexosNovos: { id: string; nome: string; driveUrl: string | null }[],
): DocumentoBaixavel[] {
  const vistos = new Set<string>();
  const saida: DocumentoBaixavel[] = [];
  const empurrar = (id: string, nome: string, driveUrl: string | null) => {
    if (vistos.has(id)) return;
    vistos.add(id);
    saida.push({ id, nome, driveUrl });
  };
  for (const d of attachments) empurrar(d.id, d.name, d.driveUrl);
  for (const d of documentosDaAssessoria) empurrar(d.id, d.name, d.driveUrl);
  for (const a of anexosNovos) empurrar(a.id, a.nome, a.driveUrl);
  return saida;
}
