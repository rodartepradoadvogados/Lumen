// Vocabulário dos chips de fila da triagem de publicações (/publicacoes): "A tratar" (padrão),
// "Minhas", "Sem processo" e "Tratadas". A fila é definida pelo STATUS DO ESCRITÓRIO
// (Publication.triageStatus) e, para cada pessoa, pelo que ela ainda não marcou como vista:
// "vista" é uma marca individual (PublicationRead) que tira a publicação da fila de quem marcou,
// sem mexer na fila das outras pessoas (decisão do dono, 02/10/2026). Antes "vista" não tirava nada
// da fila — o botão Marcar vistas parecia não fazer efeito.
//
// Puro, sem Prisma: usado pelo servidor (contagens e filtro) e pelo cliente (reaplicar o filtro nas
// atualizações otimistas depois de cada ação, sem esperar um router.refresh()).
export type PublicationChipKey = "a-tratar" | "minhas" | "sem-processo" | "tratadas";

export type ChipMatchable = {
  allRead: boolean;
  primary: {
    assignedToId: string | null;
    case: unknown;
    triageStatus: string;
  };
};

export function matchesPublicationChip(group: ChipMatchable, chip: PublicationChipKey, viewerId: string): boolean {
  const tratada = group.primary.triageStatus === "TRATADA";
  if (chip === "tratadas") return tratada;
  // "Vista" tira a publicação da fila de QUEM marcou (allRead é por usuário, ver PublicationRead);
  // para as outras pessoas do escritório ela continua em A tratar até alguém tratá-la.
  const aberta = !tratada && !group.allRead;
  if (chip === "minhas") return aberta && group.primary.assignedToId === viewerId;
  if (chip === "sem-processo") return aberta && !group.primary.case;
  return aberta; // a-tratar (padrão)
}

// Aceita os nomes antigos ("nao-triadas", "arquivadas") para não quebrar links já salvos.
export function parsePublicationChip(value: string | undefined): PublicationChipKey {
  if (value === "minhas" || value === "sem-processo") return value;
  if (value === "tratadas" || value === "arquivadas") return "tratadas";
  return "a-tratar";
}
