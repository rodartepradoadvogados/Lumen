import { previaDoCorpo } from "@/lib/mensagensDoChat";

// A MENSAGEM FIXADA NO TOPO DA CONVERSA (PR 10): a forma que viaja para o celular e o trecho que o topo mostra.
// Uma por atendimento, visível a quem tem acesso ao atendimento (a equipe), e o estado dela vem junto com o
// estado do chat (a atualização a cada 15 s), então fixar num aparelho aparece no outro sem recarregar.

export const TAMANHO_DO_TRECHO_FIXADO = 160;

export type FixadaDoChat = {
  mensagemId: string;
  autor: "Cliente" | "Escritório";
  /** O começo da mensagem (mídia vira "Imagem", "Documento: x.pdf"...), no máximo 160 caracteres. */
  trecho: string;
  fixadaPorNome: string | null;
  /** ISO. */
  fixadaEm: string;
};

/** O trecho que o topo e a citação mostram: uma linha de texto corrido, cortada com reticências. */
export function trechoDaMensagem(body: string, limite = TAMANHO_DO_TRECHO_FIXADO): string {
  const t = previaDoCorpo(body).replace(/\s+/g, " ").trim();
  if (!t) return "(mensagem vazia)";
  return t.length > limite ? `${t.slice(0, limite - 1).trimEnd()}…` : t;
}

export function montarFixada(
  f: { whatsappMessageId: string; createdAt: Date; fixadaPorNome: string | null },
  m: { direction: string; body: string },
): FixadaDoChat {
  return {
    mensagemId: f.whatsappMessageId,
    autor: m.direction === "OUT" ? "Escritório" : "Cliente",
    trecho: trechoDaMensagem(m.body),
    fixadaPorNome: f.fixadaPorNome,
    fixadaEm: f.createdAt.toISOString(),
  };
}

/** Só mensagem que o servidor gravou pode ser fixada ou citada: o balão "enviando" do aparelho não tem id de verdade. */
export function mensagemPodeSerFixada(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) && !id.startsWith("local-");
}
