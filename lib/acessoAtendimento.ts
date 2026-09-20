import { PAPEIS_RECEPCAO } from "@/lib/filaDeTransferencia";

// ============================================================================
// QUEM PODE VER OS ATENDIMENTOS.
//
// A regra do dono: **advogado cadastrado como ADMINISTRADOR, e recepção/secretaria.** Mais
// ninguém — e quem não pode não vê a tela, não vê o atalho, e não vê os atendimentos na tela
// inicial, nem no site nem no aplicativo.
//
// POR QUE ISSO É MAIS DURO DO QUE PARECE. Atendimento não é uma lista de tarefas: é a conversa
// crua de uma pessoa que ainda não é cliente, contando o problema dela antes de saber se vai
// contratar. Tem doença, tem dívida, tem briga de família. Quem não vai atender aquilo não tem
// por que ler.
//
// A LISTA DE PAPÉIS DA RECEPÇÃO É A MESMA DA FILA, importada e não recopiada. São duas perguntas
// diferentes — "quem recebe lead" e "quem pode abrir lead" — mas sobre o MESMO conjunto de
// pessoas: duas listas iguais escritas em dois lugares ficam iguais por um mês e depois divergem
// no dia em que alguém acrescenta um papel novo num só.
// ============================================================================

/**
 * O campo se chama `role` e não `papel` porque é assim que ele se chama no banco (`User.role`) —
 * e com o mesmo nome o `viewer` inteiro entra aqui sem tradutor no meio. Tradutor entre a linha
 * do banco e a regra de acesso é onde um campo se perde calado.
 */
export type QuemOlha = {
  isAdmin: boolean;
  role: string | null | undefined;
};

function ehRecepcao(papel: string | null | undefined): boolean {
  const p = (papel || "").trim().toLowerCase();
  return PAPEIS_RECEPCAO.some((x) => p === x);
}

/**
 * Pode abrir o Atendimento?
 *
 * FECHADO POR PADRÃO: papel desconhecido, vazio ou nulo NÃO passa. Um `role` que ninguém
 * reconhece é exatamente o caso em que não se deve adivinhar a favor do acesso.
 *
 * Note que "advogado" sozinho NÃO basta — tem de ser administrador. Foi assim que o dono
 * determinou, e a consequência está em lib/filaDeTransferencia.ts: quem não pode abrir o lead
 * também não entra no rodízio que o distribui. Não adiantaria entregar a conversa a quem não
 * consegue lê-la.
 */
export function podeVerAtendimentos(quem: QuemOlha | null | undefined): boolean {
  if (!quem) return false;
  return quem.isAdmin === true || ehRecepcao(quem.role);
}

/** A frase única, para as telas e as ações dizerem a mesma coisa. */
export const SEM_ACESSO_AO_ATENDIMENTO =
  "O Atendimento é restrito aos sócios administradores e à recepção deste escritório.";
