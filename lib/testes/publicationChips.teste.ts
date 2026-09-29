import { teste, igual, resumo } from "./executar";
import { matchesPublicationChip, parsePublicationChip } from "../publicationChips";

// A fila de /publicacoes é o STATUS do escritório, não a leitura de cada pessoa: publicação vista e
// nunca tratada tem que continuar em "A tratar" (antes sumia de todas as abas).
const g = (over: Partial<{ allRead: boolean; assignedToId: string | null; case: unknown; triageStatus: string }> = {}) => ({
  allRead: false,
  primary: { assignedToId: null as string | null, case: { id: "c" } as unknown, triageStatus: "PENDENTE", ...over },
});

teste("A tratar = status diferente de TRATADA, vista ou não", () => {
  igual(matchesPublicationChip(g({ triageStatus: "PENDENTE" }), "a-tratar", "u1"), true);
  igual(matchesPublicationChip({ ...g({ triageStatus: "EM_ANALISE" }), allRead: true }, "a-tratar", "u1"), true);
  igual(matchesPublicationChip(g({ triageStatus: "TRATADA" }), "a-tratar", "u1"), false);
});

teste("Tratadas é o complemento de A tratar", () => {
  igual(matchesPublicationChip(g({ triageStatus: "TRATADA" }), "tratadas", "u1"), true);
  igual(matchesPublicationChip(g({ triageStatus: "PENDENTE" }), "tratadas", "u1"), false);
});

teste("Minhas e Sem processo só contam o que está aberto", () => {
  igual(matchesPublicationChip(g({ assignedToId: "u1" }), "minhas", "u1"), true);
  igual(matchesPublicationChip(g({ assignedToId: "u1", triageStatus: "TRATADA" }), "minhas", "u1"), false);
  igual(matchesPublicationChip(g({ assignedToId: "u2" }), "minhas", "u1"), false);
  igual(matchesPublicationChip(g({ case: null }), "sem-processo", "u1"), true);
  igual(matchesPublicationChip(g({ case: null, triageStatus: "TRATADA" }), "sem-processo", "u1"), false);
});

teste("links antigos continuam valendo", () => {
  igual(parsePublicationChip("nao-triadas"), "a-tratar");
  igual(parsePublicationChip(undefined), "a-tratar");
  igual(parsePublicationChip("arquivadas"), "tratadas");
  igual(parsePublicationChip("tratadas"), "tratadas");
  igual(parsePublicationChip("minhas"), "minhas");
});

resumo("publicationChips");
