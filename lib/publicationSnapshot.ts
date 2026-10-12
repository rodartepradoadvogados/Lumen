// Fica fora de lib/actions/publications.ts porque arquivo "use server" só pode exportar funções async.

// Colunas lidas para montar um snapshot completo.
export const SELECT_SNAPSHOT = {
  id: true,
  assignedToId: true,
  triageStatus: true,
  deadlineGenerated: true,
  estado: true,
  motivoEstado: true,
  desfecho: true,
  desfechoPorId: true,
  desfechoEm: true,
} as const;
