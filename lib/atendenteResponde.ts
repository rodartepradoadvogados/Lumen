import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { deveResponder, montarPergunta } from "@/lib/agenteAtendimento";
import { perguntarAoHermes, hermesConfigurado, FalhaDoHermes } from "@/lib/hermesPonte";
import { sendWhatsappText } from "@/lib/whatsapp";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

// ============================================================================
// O ATENDENTE RESPONDE (ou explica por que não).
//
// Esta função nunca lança. Ela é chamada da rota que recebe o webhook do WhatsApp, e ali um erro
// não pode virar erro HTTP: a Evolution reenviaria a mesma mensagem em laço, e o cliente receberia
// a mesma resposta várias vezes. Falhou, registra e devolve o motivo.
//
// A DECISÃO NÃO MORA AQUI — mora em `deveResponder`, que é pura e testada. Aqui só se busca o
// estado, se pergunta ao agente e se envia. É de propósito: a parte que decide se uma máquina
// fala com um cliente de verdade tem que caber num teste de mesa.
// ============================================================================

const QUANTAS_MENSAGENS_DE_CONTEXTO = 10;

export async function atendenteResponde(
  attendanceId: string,
  opcoes: { forcar?: boolean } = {},
): Promise<{ respondeu: boolean; motivo: string }> {
  try {
    const atendimento = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: {
        id: true,
        officeId: true,
        clientName: true,
        waPhone: true,
        status: true,
        agenteResponde: true,
        agenteSilenciadoEm: true,
        office: {
          select: {
            name: true,
            slug: true,
            moduloWhatsapp: true,
            whatsappConfig: {
              select: {
                agenteAtivo: true,
                agenteTodos: true,
                agenteNumeros: true,
                agenteNome: true,
                agenteInstrucoes: true,
              },
            },
          },
        },
      },
    });

    if (!atendimento || !atendimento.waPhone) {
      return { respondeu: false, motivo: "atendimento sem WhatsApp vinculado" };
    }
    const config = atendimento.office.whatsappConfig;
    if (!config) return { respondeu: false, motivo: "WhatsApp não configurado" };
    if (!config.agenteAtivo) {
      return { respondeu: false, motivo: "o atendente de IA está desligado neste escritório" };
    }

    // `forcar` é o botão "responder à última pergunta", que existe porque marcar a chave no meio
    // de uma conversa vale da PRÓXIMA mensagem em diante. Ele pula a chave da conversa — e só
    // ela: módulo, silêncio, arquivamento e lista de números continuam valendo, porque essas são
    // as travas que protegem o cliente, não as que controlam a conveniência.
    const veredito = deveResponder(
      {
        moduloWhatsapp: atendimento.office.moduloWhatsapp,
        agenteAtivo: config.agenteAtivo,
        agenteTodos: config.agenteTodos,
        agenteNumeros: config.agenteNumeros,
      },
      {
        agenteResponde: opcoes.forcar ? true : atendimento.agenteResponde,
        agenteSilenciadoEm: atendimento.agenteSilenciadoEm,
        status: atendimento.status,
      },
      atendimento.waPhone,
    );
    if (!veredito.responde) return { respondeu: false, motivo: veredito.motivo };

    if (!hermesConfigurado()) {
      return { respondeu: false, motivo: "a ponte com o agente não está configurada" };
    }

    const mensagens = await prisma.whatsappMessage.findMany({
      where: { attendanceId },
      orderBy: { createdAt: "desc" },
      take: QUANTAS_MENSAGENS_DE_CONTEXTO,
      select: { direction: true, body: true },
    });
    const emOrdem = mensagens.reverse();
    const ultima = emOrdem[emOrdem.length - 1];

    // A última mensagem tem que ser DO CLIENTE. Se a última é do escritório, não há pergunta
    // pendente — responder aqui seria o atendente falando sozinho.
    if (!ultima || ultima.direction !== "IN") {
      return { respondeu: false, motivo: "a última mensagem não é do cliente" };
    }

    const pergunta = montarPergunta({
      nomeDoAtendente: config.agenteNome?.trim() || "Atendimento",
      nomeDoEscritorio: atendimento.office.name,
      instrucoesDoEscritorio: config.agenteInstrucoes,
      nomeDoCliente: atendimento.clientName,
      historico: emOrdem.slice(0, -1).map((m) => ({
        de: m.direction === "IN" ? ("cliente" as const) : ("escritorio" as const),
        texto: m.body,
      })),
      mensagem: ultima.body,
    });

    let resposta: string;
    try {
      // SEM FERRAMENTAS. O atendente do WhatsApp fala com CLIENTE, e cliente não pode puxar dado
      // do escritório — nem o dele próprio, porque quem escreve naquele número ainda não foi
      // identificado. As ferramentas são do agente interno, que fala com quem fez login.
      const r = await perguntarAoHermes({ slug: atendimento.office.slug, mensagem: pergunta });
      resposta = (r.resposta || "").trim();
    } catch (erro) {
      const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
      console.error("[atendente] agente indisponível:", motivo);
      return { respondeu: false, motivo: `agente indisponível: ${motivo}` };
    }

    if (!resposta) return { respondeu: false, motivo: "o agente devolveu resposta vazia" };

    const envio = await sendWhatsappText(atendimento.officeId, atendimento.waPhone, resposta);
    if (!envio.ok) {
      return { respondeu: false, motivo: envio.error || "falha ao enviar" };
    }

    await prisma.whatsappMessage.create({
      data: {
        officeId: atendimento.officeId,
        attendanceId,
        direction: "OUT",
        porAgente: true,
        body: resposta,
        waMessageId: envio.waMessageId || null,
        status: "SENT",
        fromNumber: atendimento.waPhone,
      },
    });
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { waLastMessageAt: new Date() },
    });

    revalidatePath(`/atendimento/${attendanceId}`);
    revalidatePath("/atendimento");
    return { respondeu: true, motivo: "respondido pelo atendente" };
  } catch (erro) {
    // Nunca lança: ver a nota no topo.
    console.error("[atendente] falha inesperada:", mensagemDeErro(erro));
    return { respondeu: false, motivo: "falha inesperada ao responder" };
  }
}

/**
 * Cala o atendente NESTA conversa, para sempre, porque uma pessoa do escritório assumiu.
 *
 * Idempotente: chamada de novo, não mexe na data da primeira vez — é a primeira que interessa.
 */
export async function silenciarAtendente(attendanceId: string, officeId: string): Promise<void> {
  try {
    // `updateMany` com `agenteSilenciadoEm: null` no filtro é o que torna a operação idempotente:
    // chamada de novo, não encontra linha e não mexe na data da primeira vez — e é a primeira que
    // interessa, porque é ela que diz quando o humano entrou.
    //
    // O rastro fica no próprio atendimento, e não na auditoria do assistente: quem vai perguntar
    // "por que o atendente parou de responder aqui?" está olhando a conversa, não um relatório.
    await prisma.attendance.updateMany({
      where: { id: attendanceId, officeId, agenteSilenciadoEm: null },
      data: { agenteSilenciadoEm: new Date(), agenteResponde: false },
    });
  } catch (erro) {
    console.error("[atendente] falha ao silenciar:", mensagemDeErro(erro));
  }
}
