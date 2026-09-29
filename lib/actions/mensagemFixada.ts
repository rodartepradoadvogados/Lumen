"use server";

import { prisma } from "@/lib/prisma";
import { atendimentoDaAcao } from "@/lib/guardaDoAtendimento";
import { lerFixadaDoAtendimento } from "@/lib/mensagemFixadaDb";
import { mensagemPodeSerFixada, type FixadaDoChat } from "@/lib/mensagemFixada";

// FIXAR / DESAFIXAR (PR 10). Guarda `atendimentoDaAcao` ANTES de tocar em qualquer coisa (sessão, acesso e
// recorte por dono; lead de outro escritório ou de outro dono = "Atendimento não encontrado", sem ler nada).
// A mensagem tem de ser DESTE atendimento e deste escritório. Uma fixada por atendimento (fixar outra troca),
// visível a quem tem acesso a ele. Qualquer pessoa com acesso à conversa fixa e desafixa: é do atendimento,
// não da pessoa.

export async function fixarMensagem(idDoAtendimento: string, idDaMensagem: string): Promise<{ erro: string } | { erro?: undefined; fixada: FixadaDoChat | null }> {
  const r = await atendimentoDaAcao(idDoAtendimento);
  if (r.erro !== undefined) return { erro: r.erro };
  const { viewer, attendance } = r;
  if (typeof idDaMensagem !== "string" || !mensagemPodeSerFixada(idDaMensagem)) return { erro: "Esta mensagem ainda não foi confirmada; espere ela ser enviada para fixar." };
  const m = await prisma.whatsappMessage.findFirst({ where: { id: idDaMensagem, attendanceId: attendance.id, officeId: viewer.officeId }, select: { id: true } });
  if (!m) return { erro: "Mensagem não encontrada nesta conversa." };
  await prisma.mensagemFixada.upsert({
    where: { attendanceId: attendance.id },
    create: { officeId: viewer.officeId, attendanceId: attendance.id, whatsappMessageId: m.id, fixadaPorId: viewer.id },
    update: { whatsappMessageId: m.id, fixadaPorId: viewer.id, createdAt: new Date() },
  });
  return { fixada: await lerFixadaDoAtendimento(attendance.id, viewer.officeId) };
}

export async function desafixarMensagem(idDoAtendimento: string): Promise<{ erro?: string }> {
  const r = await atendimentoDaAcao(idDoAtendimento);
  if (r.erro !== undefined) return { erro: r.erro };
  const { viewer, attendance } = r;
  await prisma.mensagemFixada.deleteMany({ where: { attendanceId: attendance.id, officeId: viewer.officeId } });
  return {};
}
