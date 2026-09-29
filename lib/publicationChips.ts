// Vocabulário dos chips de fila da triagem de publicações (/publicacoes): "A tratar" (padrão),
// "Minhas", "Sem processo" e "Tratadas". A fila é definida pelo STATUS DO ESCRITÓRIO
// (Publication.triageStatus), nunca pela leitura de cada pessoa: "vista" é uma marca individual e
// não tira nada da fila — antes a fila padrão era "Não triadas" (= não lida por mim), e uma
// publicação vista e nunca tratada sumia de todas as abas (32 no banco de demonstração).
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
  const aberta = group.primary.triageStatus !== "TRATADA";
  if (chip === "tratadas") return !aberta;
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
