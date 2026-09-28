import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/appUrl";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { sendWhatsappText } from "@/lib/whatsapp";
import { enqueueNotification } from "@/lib/notificationOutbox";
import { composePhoneWithDdi } from "@/lib/documentoEnvios";
import type { GatilhoDaTransferencia } from "@/lib/filaDeTransferencia";
import {
  montarAvisoDeLead,
  partirEmMensagens,
  resumoCurto,
  POR_QUE_CHEGOU,
  type DadosDoAviso,
} from "@/lib/avisoDeLead";

// ============================================================================
// AVISAR QUEM RECEBEU O LEAD.
//
// Três caminhos, um texto só (montado em lib/avisoDeLead.ts, que é puro e testado):
//
//   WhatsApp — SÍNCRONO, aqui e agora. É o único canal que faz o telefone vibrar num segundo, e
//              é o canal em que o advogado já está quando o lead chega.
//   Push      — pela fila de comunicados, respeitando a preferência da pessoa.
//   E-mail    — idem, e serve de registro do que aconteceu e quando.
//
// PUSH E E-MAIL NÃO SÃO DRENADOS AQUI. Existe `drainSpecificNotifications` para envio imediato,
// e a tentação de usá-la é grande — mas isto roda dentro do webhook do WhatsApp, que já gastou
// quase todo o seu tempo esperando o modelo responder ao cliente. Somar um SMTP a esse orçamento
// é trocar "o push chegou 10 minutos depois" por "o pedido estourou e nada chegou". O cron de 15
// minutos os entrega, e o WhatsApp já avisou na hora.
//
// NUNCA LANÇA. É chamada logo depois de a transferência ter dado certo; falhar o aviso não pode
// desfazer a transferência nem derrubar a resposta que está saindo para o cliente.
// ============================================================================

/** Quantas falas do cliente entram no resumo. Alto de propósito: o resumo não é cortado. */
const FALAS_NO_RESUMO = 200;

export async function avisarAdvogadoDoLead(
  attendanceId: string,
  paraUserId: string,
  gatilho: GatilhoDaTransferencia,
): Promise<{ ok: boolean; motivo: string }> {
  try {
    const [atendimento, pessoa] = await Promise.all([
      prisma.attendance.findUnique({
        where: { id: attendanceId },
        select: {
          id: true,
          officeId: true,
          clientName: true,
          waPhone: true,
          anuncioTitulo: true,
          campanha: {
            select: {
              nome: true,
              documentos: { select: { nome: true, obrigatorio: true }, orderBy: { ordem: "asc" } },
            },
          },
          attachments: { select: { name: true }, orderBy: { createdAt: "asc" }, take: 20 },
        },
      }),
      prisma.user.findUnique({
        where: { id: paraUserId },
        select: { id: true, name: true, phone: true, phoneDdi: true, officeId: true },
      }),
    ]);

    if (!atendimento || !pessoa) return { ok: false, motivo: "atendimento ou destinatário não encontrado" };
    if (pessoa.officeId !== atendimento.officeId) {
      // Não deveria acontecer (a fila só monta gente do mesmo escritório), mas o dia em que
      // acontecer é o dia em que o lead de um escritório chega ao telefone de outro.
      return { ok: false, motivo: "destinatário de outro escritório" };
    }

    const falas = await prisma.whatsappMessage.findMany({
      where: { attendanceId, direction: "IN" },
      orderBy: { createdAt: "asc" },
      take: FALAS_NO_RESUMO,
      select: { body: true },
    });

    const dados: DadosDoAviso = {
      nomeDoCliente: atendimento.clientName,
      telefoneDoLead: atendimento.waPhone || "",
      gatilho,
      campanha: atendimento.campanha?.nome ?? null,
      anuncio: atendimento.anuncioTitulo,
      falasDoCliente: falas.map((f) => f.body).filter((b) => b.trim()),
      documentos: atendimento.campanha?.documentos ?? [],
      anexos: atendimento.attachments.map((a) => a.name),
      linkNoLumen: `${getAppUrl()}/atendimento/${attendanceId}`,
    };

    const texto = montarAvisoDeLead(dados);

    // ── WhatsApp ──────────────────────────────────────────────────────────────────────────────
    let porWhatsapp = "sem telefone cadastrado";
    if (pessoa.phone?.trim()) {
      const numero = composePhoneWithDdi(pessoa.phoneDdi, pessoa.phone);
      const partes = partirEmMensagens(texto);
      let enviadas = 0;
      for (const parte of partes) {
        const envio = await sendWhatsappText(atendimento.officeId, numero, parte);
        if (!envio.ok) {
          porWhatsapp = `falhou na parte ${enviadas + 1} de ${partes.length}: ${envio.error || "erro"}`;
          break;
        }
        enviadas += 1;
      }
      // As partes do aviso NÃO viram WhatsappMessage do atendimento. Elas foram para o telefone do
      // advogado, não para o do cliente — gravá-las ali faria o histórico da conversa mostrar ao
      // escritório mensagens que o cliente nunca recebeu.
      if (enviadas === partes.length) {
        porWhatsapp = partes.length === 1 ? "enviado" : `enviado em ${partes.length} partes`;
      }
    }

    // ── Push e e-mail, pela fila ──────────────────────────────────────────────────────────────
    // `dedupeKey` amarrado ao atendimento e à pessoa: o mesmo lead nunca avisa a mesma pessoa duas
    // vezes, nem que a transferência seja reprocessada.
    await enqueueNotification({
      userId: pessoa.id,
      officeId: atendimento.officeId,
      event: "LEAD_TRANSFERIDO",
      title: "Lead novo para você",
      body: resumoCurto(dados),
      url: dados.linkNoLumen,
      vars: {
        cliente: atendimento.clientName,
        teor: `${POR_QUE_CHEGOU[gatilho]}${dados.campanha ? ` · campanha: ${dados.campanha}` : ""}.`,
        link: dados.linkNoLumen,
      },
      dedupeKey: `lead-transferido:${attendanceId}:${pessoa.id}`,
    });

    return { ok: true, motivo: `avisado (WhatsApp: ${porWhatsapp})` };
  } catch (erro) {
    console.error("[aviso] falha ao avisar o advogado:", mensagemDeErro(erro));
    return { ok: false, motivo: "falha ao avisar" };
  }
}
