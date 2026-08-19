// Vocabulário dos 4 chips de filtro da triagem de publicações (documento 05 do handoff do
// redesenho, "Não triadas · Minhas · Sem processo · Arquivadas") — substituem as antigas abas
// Não lidas/Lidas/Todos como navegação PRINCIPAL de /publicacoes. Puro, sem Prisma: usado tanto
// pelo servidor (app/(app)/publicacoes/page.tsx, para filtrar/contar antes de mandar pro cliente)
// quanto pelo cliente (components/PublicationsTriage.tsx, para reaplicar o mesmo filtro nas
// atualizações otimistas locais depois de arquivar/vincular/criar tarefa — sem esperar um
// router.refresh() completo pra a fila reagir).
//
// Cada chip é independente dos outros três (não é uma árvore de sub-filtros): "Arquivadas"
// reaproveita Publication.triageStatus = TRATADA (campo já existente, sem mudança de schema) como
// o desfecho de "Arquivar" na barra de ações do teor — os outros dois valores (PENDENTE/
// EM_ANALISE) continuam existindo e não têm chip próprio aqui, só o seletor que já existe na
// tela do Processo.
export type PublicationChipKey = "nao-triadas" | "minhas" | "sem-processo" | "arquivadas";

export type ChipMatchable = {
  allRead: boolean;
  primary: {
    assignedToId: string | null;
    case: unknown;
    triageStatus: string;
  };
};

export function matchesPublicationChip(group: ChipMatchable, chip: PublicationChipKey, viewerId: string): boolean {
  if (chip === "minhas") return group.primary.assignedToId === viewerId;
  if (chip === "sem-processo") return !group.primary.case;
  if (chip === "arquivadas") return group.primary.triageStatus === "TRATADA";
  return !group.allRead; // nao-triadas (padrão) — mesmo critério da antiga aba "Não lidas"
}

export function parsePublicationChip(value: string | undefined): PublicationChipKey {
  if (value === "minhas" || value === "sem-processo" || value === "arquivadas") return value;
  return "nao-triadas";
}
