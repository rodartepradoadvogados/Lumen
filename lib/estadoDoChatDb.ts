import { prisma } from "@/lib/prisma";
import { montarEstadoDoChat, type EstadoDoChat } from "@/lib/estadoDoChat";
import { janelaDaConversa } from "@/lib/envioDeMensagemDb";

// O lado de banco do estado do chat. ATENÇÃO: NÃO confere o dono — quem chama já passou pela guarda
// (`atendimentoDaRota` / `whereDeUmAtendimento`) e entrega o atendimento JÁ AUTORIZADO.
export async function lerEstadoDoChat(
  a: { id: string; agenteResponde: boolean; agenteSilenciadoEm: Date | null; prazoDeRespostaAte: Date | null; waPhone: string | null },
  officeId: string,
  agora: Date,
): Promise<EstadoDoChat> {
  const [ultima, cfg, janela] = await Promise.all([
    prisma.whatsappMessage.findFirst({ where: { attendanceId: a.id, officeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { direction: true } }),
    prisma.whatsappConfig.findUnique({ where: { officeId }, select: { agenteAtivo: true } }),
    janelaDaConversa(a.id, officeId, agora),
  ]);
  return montarEstadoDoChat(a, ultima?.direction ?? null, Boolean(cfg?.agenteAtivo), janela);
}
