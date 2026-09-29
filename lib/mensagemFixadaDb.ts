import { prisma } from "@/lib/prisma";
import { montarFixada, type FixadaDoChat } from "@/lib/mensagemFixada";

// O LADO DE BANCO DA MENSAGEM FIXADA. ATENÇÃO: NÃO confere o dono da conversa — quem chama já passou pela
// guarda (`atendimentoDaRota` / `atendimentoDaAcao` / `whereDeUmAtendimento`). `officeId` entra em toda consulta,
// e a mensagem fixada só vale se AINDA for desta conversa e deste escritório.
export async function lerFixadaDoAtendimento(attendanceId: string, officeId: string): Promise<FixadaDoChat | null> {
  const f = await prisma.mensagemFixada.findFirst({ where: { attendanceId, officeId }, select: { whatsappMessageId: true, createdAt: true, fixadaPorId: true } });
  if (!f) return null;
  const [m, quem] = await Promise.all([
    prisma.whatsappMessage.findFirst({ where: { id: f.whatsappMessageId, attendanceId, officeId }, select: { direction: true, body: true } }),
    f.fixadaPorId ? prisma.user.findFirst({ where: { id: f.fixadaPorId, officeId }, select: { name: true } }) : Promise.resolve(null),
  ]);
  if (!m) return null;
  return montarFixada({ whatsappMessageId: f.whatsappMessageId, createdAt: f.createdAt, fixadaPorNome: quem?.name ?? null }, m);
}
