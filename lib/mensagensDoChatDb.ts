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
import { prepararNota, type LinhaDeNota } from "@/lib/notaDaConversa";

// O LADO DE BANCO DO CHAT. ATENÇÃO: esta função NÃO confere o dono da conversa — quem a chama já
// passou pelo recorte (`whereDeUmAtendimento` na página, `atendimentoDaRota` na rota JSON) e entrega
// aqui o id JÁ AUTORIZADO. O `officeId` entra no where como segundo cinto.

type LinhaDoChat = ({ origem: "mensagem" } & Parameters<typeof prepararMensagem>[0]) | ({ origem: "nota" } & LinhaDeNota);

function preparar(l: LinhaDoChat, agora: Date): MensagemDoChat {
  return l.origem === "nota" ? prepararNota(l, agora) : prepararMensagem(l, agora);
}

/** Da mais nova para a mais antiga, pelo mesmo desempate do cursor: (instante, id). */
function juntarDoMaisNovoAoMaisAntigo<T extends { id: string; createdAt: Date }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export type PaginaDoChat = { mensagens: MensagemDoChat[]; temAnteriores: boolean; cursorDasAnteriores: string | null };

export async function carregarPaginaDoChat(
  attendanceId: string,
  officeId: string,
  opcoes: { antes?: string | null; limite?: number; agora?: Date } = {},
): Promise<PaginaDoChat> {
  const limite = opcoes.limite ?? TAMANHO_DA_PAGINA;
  const agora = opcoes.agora ?? new Date();
  const cursorAntes = filtroAntesDoCursor(lerCursor(opcoes.antes));
  // Mensagens de WhatsApp e notas/avisos da equipe (NotaDaConversa) são duas tabelas lidas com o MESMO cursor
  // e juntadas pela mesma ordem: as `limite + 1` mais novas da união estão dentro das `limite + 1` mais novas
  // de cada tabela, então a página e o "tem anteriores" saem certos.
  const [linhasDeMensagem, linhasDeNota] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { attendanceId, officeId, ...cursorAntes },
      orderBy: ORDEM_DA_PAGINA,
      take: limite + 1,
      include: { transcricao: { select: { status: true, texto: true, erro: true } } },
    }),
    prisma.notaDaConversa.findMany({ where: { attendanceId, officeId, ...cursorAntes }, orderBy: ORDEM_DA_PAGINA, take: limite + 1 }),
  ]);
  const linhas = juntarDoMaisNovoAoMaisAntigo<LinhaDoChat>([
    ...linhasDeMensagem.map((m) => ({ ...m, origem: "mensagem" as const })),
    ...linhasDeNota.map((n) => ({ ...n, origem: "nota" as const })),
  ]).slice(0, limite + 1);
  const pagina = paginaDeMensagens(linhas, limite);
  return {
    mensagens: pagina.mensagens.map((m) => preparar(m, agora)),
    temAnteriores: pagina.temAnteriores,
    cursorDasAnteriores: pagina.cursorDasAnteriores,
  };
}

/** As mensagens POSTERIORES ao cursor, da mais antiga para a mais nova (no máximo 200 por vez). */
export async function carregarMensagensDepois(attendanceId: string, officeId: string, depois: string, opcoes: { agora?: Date } = {}): Promise<MensagemDoChat[]> {
  const cursor = lerCursor(depois);
  if (!cursor) return [];
  const agora = opcoes.agora ?? new Date();
  const depoisDoCursor = filtroDepoisDoCursor(cursor);
  const ordem = [{ createdAt: "asc" as const }, { id: "asc" as const }];
  const [linhasDeMensagem, linhasDeNota] = await Promise.all([
    prisma.whatsappMessage.findMany({
      where: { attendanceId, officeId, ...depoisDoCursor },
      orderBy: ordem,
      take: 200,
      include: { transcricao: { select: { status: true, texto: true, erro: true } } },
    }),
    prisma.notaDaConversa.findMany({ where: { attendanceId, officeId, ...depoisDoCursor }, orderBy: ordem, take: 200 }),
  ]);
  const juntas = [...juntarDoMaisNovoAoMaisAntigo<LinhaDoChat>([...linhasDeMensagem.map((m) => ({ ...m, origem: "mensagem" as const })), ...linhasDeNota.map((n) => ({ ...n, origem: "nota" as const }))])].reverse();
  return juntas.slice(0, 200).map((m) => preparar(m, agora));
}
