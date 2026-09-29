import { prisma } from "@/lib/prisma";
import {
  ORDEM_DA_PAGINA,
  TAMANHO_DA_PAGINA,
  filtroAntesDoCursor,
  filtroDepoisDoCursor,
  lerCursor,
  paginaDeMensagens,
  prepararMensagem,
  type MensagemDoChat,
} from "@/lib/mensagensDoChat";

// O LADO DE BANCO DO CHAT. ATENÇÃO: esta função NÃO confere o dono da conversa — quem a chama já
// passou pelo recorte (`whereDeUmAtendimento` na página, `atendimentoDaRota` na rota JSON) e entrega
// aqui o id JÁ AUTORIZADO. O `officeId` entra no where como segundo cinto.

export type PaginaDoChat = { mensagens: MensagemDoChat[]; temAnteriores: boolean; cursorDasAnteriores: string | null };

export async function carregarPaginaDoChat(
  attendanceId: string,
  officeId: string,
  opcoes: { antes?: string | null; limite?: number; agora?: Date } = {},
): Promise<PaginaDoChat> {
  const limite = opcoes.limite ?? TAMANHO_DA_PAGINA;
  const agora = opcoes.agora ?? new Date();
  const linhas = await prisma.whatsappMessage.findMany({
    where: { attendanceId, officeId, ...filtroAntesDoCursor(lerCursor(opcoes.antes)) },
    orderBy: ORDEM_DA_PAGINA,
    take: limite + 1,
    include: { transcricao: { select: { status: true, texto: true, erro: true } } },
  });
  const pagina = paginaDeMensagens(linhas, limite);
  return {
    mensagens: pagina.mensagens.map((m) => prepararMensagem(m, agora)),
    temAnteriores: pagina.temAnteriores,
    cursorDasAnteriores: pagina.cursorDasAnteriores,
  };
}

/** As mensagens POSTERIORES ao cursor, da mais antiga para a mais nova (no máximo 200 por vez). */
export async function carregarMensagensDepois(attendanceId: string, officeId: string, depois: string, opcoes: { agora?: Date } = {}): Promise<MensagemDoChat[]> {
  const cursor = lerCursor(depois);
  if (!cursor) return [];
  const agora = opcoes.agora ?? new Date();
  const linhas = await prisma.whatsappMessage.findMany({
    where: { attendanceId, officeId, ...filtroDepoisDoCursor(cursor) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200,
    include: { transcricao: { select: { status: true, texto: true, erro: true } } },
  });
  return linhas.map((m) => prepararMensagem(m, agora));
}
