// ============================================================================
// A CONFIRMAÇÃO IMEDIATA DE ÁUDIO.
//
// Quando um áudio chega, a Ana manda NA HORA uma frase curta e FIXA — "recebi, já vou ouvir e te
// respondo em seguida" — em vez de deixar o cliente sem nenhum sinal enquanto a transcrição (que
// roda fora deste pedido, ver lib/transcricaoAssincrona.ts) e a resposta de verdade acontecem.
//
// A FRASE NÃO PASSA PELO HERMES, DE PROPÓSITO. É exatamente essa a razão de existir: uma frase
// fixa é instantânea e não tem como dar timeout. Se ela dependesse do Hermes, o problema que a
// resposta assíncrona resolve (o pedido do webhook não pode ficar esperando uma chamada lenta)
// voltaria pela porta dos fundos.
//
// A DECISÃO DE FALAR OU NÃO é a MESMA de sempre (deveResponder, lib/agenteAtendimento.ts) — um
// escritório com o atendente desligado, ou uma conversa já silenciada, não ganha nem esta frase.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { deveResponder } from "@/lib/agenteAtendimento";
import { sendWhatsappText } from "@/lib/whatsapp";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { revalidatePath } from "next/cache";

/**
 * O texto fixo. Exportado para o teste conferir a mensagem gravada — e para nunca divergir entre
 * o que é enviado e o que é comparado.
 */
export const CONFIRMACAO_DE_AUDIO = "Recebi o seu áudio, já vou ouvir e te respondo em seguida.";

/**
 * Manda a confirmação fixa quando um áudio acaba de chegar. Nunca lança — mesmo padrão do resto
 * da integração de WhatsApp (lib/whatsapp.ts, lib/atendenteResponde.ts): esta função é chamada
 * direto da rota do webhook, e ali um erro não pode virar erro HTTP.
 *
 * NÃO CONSULTA O HERMES, NÃO MONTA HISTÓRICO — só confere se a Ana pode falar nesta conversa
 * (deveResponder, a mesma trava de sempre) e, se puder, envia o texto fixo e registra a mensagem.
 */
export async function confirmarRecebimentoDeAudio(attendanceId: string): Promise<{ enviou: boolean; motivo: string }> {
  try {
    const atendimento = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: {
        officeId: true,
        waPhone: true,
        status: true,
        agenteResponde: true,
        agenteSilenciadoEm: true,
        office: {
          select: {
            moduloWhatsapp: true,
            whatsappConfig: { select: { agenteAtivo: true, agenteTodos: true, agenteNumeros: true } },
          },
        },
      },
    });

    if (!atendimento || !atendimento.waPhone) {
      return { enviou: false, motivo: "atendimento sem WhatsApp vinculado" };
    }
    const config = atendimento.office.whatsappConfig;
    if (!config) return { enviou: false, motivo: "WhatsApp não configurado" };

    const veredito = deveResponder(
      {
        moduloWhatsapp: atendimento.office.moduloWhatsapp,
        agenteAtivo: config.agenteAtivo,
        agenteTodos: config.agenteTodos,
        agenteNumeros: config.agenteNumeros,
      },
      {
        agenteResponde: atendimento.agenteResponde,
        agenteSilenciadoEm: atendimento.agenteSilenciadoEm,
        status: atendimento.status,
      },
      atendimento.waPhone,
    );
    if (!veredito.responde) return { enviou: false, motivo: veredito.motivo };

    const envio = await sendWhatsappText(atendimento.officeId, atendimento.waPhone, CONFIRMACAO_DE_AUDIO);
    if (!envio.ok) return { enviou: false, motivo: envio.error || "falha ao enviar" };

    await prisma.whatsappMessage.create({
      data: {
        officeId: atendimento.officeId,
        attendanceId,
        direction: "OUT",
        porAgente: true,
        // A MARCA QUE IMPEDE A ANA DE SE CALAR SOZINHA DEPOIS. Ver o comentário extenso no schema
        // (WhatsappMessage.confirmacaoAutomaticaDeAudio): sem isto, esta própria mensagem vira "a
        // última mensagem" quando processarTranscricaoAssincrona chama atendenteResponde de novo,
        // e a trava "a última tem que ser do cliente" bloqueia a resposta de verdade para sempre.
        confirmacaoAutomaticaDeAudio: true,
        body: CONFIRMACAO_DE_AUDIO,
        waMessageId: envio.waMessageId || null,
        status: "SENT",
        fromNumber: atendimento.waPhone,
      },
    });
    await prisma.attendance.update({ where: { id: attendanceId }, data: { waLastMessageAt: new Date() } });

    revalidatePath(`/atendimento/${attendanceId}`);
    revalidatePath("/atendimento");
    return { enviou: true, motivo: "confirmação enviada" };
  } catch (erro) {
    // Nunca lança: ver a nota no topo.
    console.error("[confirmacaoDeAudio] falha inesperada:", mensagemDeErro(erro));
    return { enviou: false, motivo: "falha inesperada ao confirmar recebimento do áudio" };
  }
}
