import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ============================================================================
// A ÚNICA PORTA DE GRAVAÇÃO DE UMA MENSAGEM DE WHATSAPP.
//
// `Attendance.ultimaAtividadeEm` é a chave de ordem da lista de Atendimentos da Central (a conversa
// que acabou de falar sobe ao topo). Uma coluna denormalizada só é confiável se TODO caminho que
// cria uma mensagem a atualiza — e o defeito de esquecer um é do pior tipo desta casa: silencioso.
// A conversa não some nem dá erro; ela só fica parada num lugar errado da lista, e ninguém liga uma
// coisa à outra. Foi o mesmo desenho do `lastSyncAt` do Gmail (docs/ESTADO-ATUAL-E-ARMADILHAS.md,
// item 3), e a proteção é a mesma: UM lugar que sabe da regra, e um teste que falha se aparecer um
// segundo (lib/testes/atividadeDoAtendimento.teste.ts varre o código atrás de
// `whatsappMessage.create` fora deste arquivo).
//
// MESMA TRANSAÇÃO: a mensagem e a atividade do atendimento entram juntas ou não entram. Sem isso
// uma queda entre as duas gravações deixaria uma mensagem nova sem subir a conversa.
//
// `aoAtendimento` é o que o chamador JÁ gravava no atendimento logo depois da mensagem
// (`waLastMessageAt`, `firstResponseAt`): passa junto, na mesma gravação, em vez de um segundo
// `attendance.update` solto. A atividade é a hora que o BANCO deu à mensagem (`createdAt`), e não
// um `new Date()` do servidor: assim a ordem da lista e a hora exibida na mensagem são o mesmo
// instante.
// ============================================================================

export async function registrarMensagem(
  data: Prisma.WhatsappMessageUncheckedCreateInput,
  aoAtendimento: Prisma.AttendanceUncheckedUpdateInput = {},
) {
  return prisma.$transaction(async (tx) => {
    const mensagem = await tx.whatsappMessage.create({ data });
    await tx.attendance.update({
      where: { id: data.attendanceId },
      data: { ...aoAtendimento, ultimaAtividadeEm: mensagem.createdAt },
    });
    return mensagem;
  });
}
