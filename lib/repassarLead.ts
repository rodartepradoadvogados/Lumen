import { prisma } from "@/lib/prisma";
import { ESTAGIO_DE_ESPERA, podeCairEmAguardando } from "@/lib/funil";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { getAppUrl } from "@/lib/appUrl";
import { sendWhatsappText } from "@/lib/whatsapp";
import { enqueueNotification } from "@/lib/notificationOutbox";
import { composePhoneWithDdi } from "@/lib/documentoEnvios";
import { avisarAdvogadoDoLead } from "@/lib/avisarAdvogado";
import { POR_QUE_CHEGOU } from "@/lib/avisoDeLead";
import {
  montarFila,
  proximoDoRepasse,
  somarMinutosDeExpediente,
  lerJaTentaram,
  anotarTentativa,
  filaDoGatilho,
  MINUTOS_PARA_RESPONDER,
  type Expediente,
  type PessoaDaFila,
  type TipoDeFila,
  type GatilhoDaTransferencia,
} from "@/lib/filaDeTransferencia";

// ============================================================================
// O RELÓGIO DE QUINZE MINUTOS, NA PRÁTICA.
//
// Lead transferido e não atendido volta para a fila. Fechada a volta inteira sem ninguém atender,
// o caso deixa de girar e os administradores do escritório são chamados — porque nesse ponto o
// problema não é mais de quem recebeu, é de quem organiza.
//
// A DECISÃO DE PARA QUEM é pura e testada (lib/filaDeTransferencia.ts). Aqui só se lê o estado, se
// aplica e se avisa.
//
// NUNCA LANÇA, e cada atendimento é tratado num try/catch próprio: um lead com dado estranho não
// pode fazer o cron parar no meio e deixar os outros sem repasse — que é justamente o defeito que
// só aparece quando o escritório já tem volume.
// ============================================================================

type LeadVencido = {
  id: string;
  officeId: string;
  transferidoEm: Date | null;
  transferidoPor: string | null;
  responsibleId: string | null;
  filaJaTentou: string | null;
  firstResponseAt: Date | null;
  stage: string;
  campanha: { destino: string } | null;
};

function expedienteDoEscritorio(cfg: {
  expedienteDias: string;
  expedienteInicio: string;
  expedienteFim: string;
  fusoHorario: string;
} | null): Expediente {
  return {
    dias: cfg?.expedienteDias ?? "1,2,3,4,5",
    inicio: cfg?.expedienteInicio ?? "08:00",
    fim: cfg?.expedienteFim ?? "18:00",
    fuso: cfg?.fusoHorario ?? "America/Sao_Paulo",
  };
}

/**
 * O lead já foi atendido por uma pessoa?
 *
 * Dois sinais, e os dois valem: uma mensagem que SAIU sem ser do agente depois da transferência,
 * e o carimbo de primeira resposta (que existe para o caso de a resposta ter saído por um canal
 * que o sistema não vê — telefone, presencial).
 *
 * `agenteSilenciadoEm` não é consultado aqui porque já é filtrado na busca: ele é gravado no mesmo
 * instante em que alguém do escritório responde pela tela.
 */
async function alguemJaAtendeu(lead: LeadVencido): Promise<boolean> {
  if (lead.firstResponseAt) return true;
  const humana = await prisma.whatsappMessage.count({
    where: {
      attendanceId: lead.id,
      direction: "OUT",
      porAgente: false,
      ...(lead.transferidoEm ? { createdAt: { gt: lead.transferidoEm } } : {}),
    },
  });
  return humana > 0;
}

/**
 * Chama os administradores: a volta fechou e ninguém atendeu.
 *
 * O aviso vai para OS ADMINISTRADORES DO ESCRITÓRIO, e nunca para a administração do Lúmen — o
 * lead é do escritório, e quem precisa agir é quem manda na equipe dele.
 */
async function avisarAdministradores(lead: LeadVencido, quantos: number): Promise<string> {
  const admins = await prisma.user.findMany({
    where: { officeId: lead.officeId, isAdmin: true, active: true },
    select: { id: true, phone: true, phoneDdi: true },
  });
  if (admins.length === 0) return "o escritório não tem administrador ativo cadastrado";

  const atendimento = await prisma.attendance.findUnique({
    where: { id: lead.id },
    select: { clientName: true, waPhone: true },
  });
  const link = `${getAppUrl()}/atendimento/${lead.id}`;
  const quem = atendimento?.clientName || "um lead";
  const motivo = lead.transferidoPor ? POR_QUE_CHEGOU[lead.transferidoPor as GatilhoDaTransferencia] : null;

  const texto = [
    "*Lead sem atendimento*",
    `${quem} passou por ${quantos === 1 ? "a única pessoa" : `todas as ${quantos} pessoas`} da fila e ninguém respondeu no prazo.`,
    motivo ? `A triagem terminou porque ${motivo}.` : null,
    "",
    `Abra no Lúmen: ${link}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  for (const admin of admins) {
    if (admin.phone?.trim()) {
      await sendWhatsappText(lead.officeId, composePhoneWithDdi(admin.phoneDdi, admin.phone), texto);
    }
    await enqueueNotification({
      userId: admin.id,
      officeId: lead.officeId,
      event: "LEAD_TRANSFERIDO",
      title: "Lead sem atendimento",
      body: `${quem} passou por toda a fila e ninguém respondeu no prazo.`,
      url: link,
      vars: { cliente: quem, teor: "passou por toda a fila e ninguém respondeu no prazo.", link },
      // Chave diferente da do aviso de transferência: são dois eventos distintos sobre o mesmo
      // lead, e usar a mesma chave faria o segundo ser descartado como repetição do primeiro.
      dedupeKey: `lead-sem-resposta:${lead.id}:${admin.id}`,
    });
  }
  return `${admins.length} administrador(es) avisado(s)`;
}

/**
 * Empurra o card para a coluna "Aguardando" da Triagem.
 *
 * É O MOTIVO DE A COLUNA EXISTIR: o lead que ninguém respondeu em quinze minutos precisa parar de
 * ser um número numa fila e virar um card que alguém vê ao abrir a tela. Vale nos DOIS desfechos
 * do relógio — quando o lead é repassado para a pessoa seguinte e quando a volta fecha sem
 * ninguém atender —, porque nos dois o prazo passou.
 *
 * NÃO MEXE EM QUEM JÁ DECIDIU. Um lead FECHADO que recebe uma mensagem tardia não volta a pedir
 * atenção comercial: o relógio da conversa continua valendo, mas o funil já acabou para ele. E
 * quem já está em Aguardando fica onde está, para que o campo `stageChangedAt` não seja reescrito
 * a cada rodada do cron e passe a mentir sobre há quanto tempo o card está parado ali.
 */
async function empurrarParaAguardando(lead: LeadVencido): Promise<void> {
  if (!podeCairEmAguardando(lead.stage)) return;
  await prisma.attendance.update({
    where: { id: lead.id },
    data: { stage: ESTAGIO_DE_ESPERA, stageChangedAt: new Date() },
  });
}

async function tratarUmLead(lead: LeadVencido): Promise<string> {
  if (await alguemJaAtendeu(lead)) {
    // O RELÓGIO PARA, e o lead não volta para a fila. Quem respondeu assumiu.
    await prisma.attendance.update({ where: { id: lead.id }, data: { prazoDeRespostaAte: null } });
    return "atendido — relógio parado";
  }

  const cfg = await prisma.whatsappConfig.findUnique({
    where: { officeId: lead.officeId },
    select: {
      ultimoAdvogadoId: true,
      ultimaRecepcaoId: true,
      expedienteDias: true,
      expedienteInicio: true,
      expedienteFim: true,
      fusoHorario: true,
    },
  });

  const pessoas: PessoaDaFila[] = (
    await prisma.user.findMany({
      where: { officeId: lead.officeId },
      select: { id: true, name: true, role: true, active: true, recebeTransferencia: true, createdAt: true },
    })
  ).map((u) => ({
    id: u.id,
    nome: u.name,
    papel: u.role,
    ativo: u.active,
    recebeTransferencia: u.recebeTransferencia,
    criadoEm: u.createdAt,
  }));

  // A MESMA FILA DA PRIMEIRA VEZ. O desvio da campanha vence o gatilho, igual em transferirLead —
  // repassar para um tipo de fila diferente do escolhido na entrada faria o caso triado terminar
  // na recepção sem ninguém ter decidido isso.
  const destino = lead.campanha?.destino;
  const preferida: TipoDeFila | null = destino === "ADVOGADOS" || destino === "RECEPCAO" ? destino : null;
  const tipo = preferida ?? filaDoGatilho((lead.transferidoPor as GatilhoDaTransferencia) ?? "ROTEIRO");
  const fila = montarFila(pessoas, tipo);

  const jaTentaram = anotarTentativa(lead.filaJaTentou, lead.responsibleId ?? "");
  const proximo = proximoDoRepasse(fila, lerJaTentaram(jaTentaram), lead.responsibleId);

  if (!proximo) {
    await prisma.attendance.update({
      where: { id: lead.id },
      // `prazoDeRespostaAte` vai a nulo junto com o carimbo: é o que faz o cron parar de pegar
      // este lead. Sem isso ele giraria para sempre, avisando os administradores a cada rodada.
      data: { semRespostaEm: new Date(), prazoDeRespostaAte: null, filaJaTentou: jaTentaram },
    });
    await empurrarParaAguardando(lead);
    const aviso = await avisarAdministradores(lead, Math.max(fila.length, 1));
    return `volta fechada — ${aviso}`;
  }

  const expediente = expedienteDoEscritorio(cfg);
  const prazo = somarMinutosDeExpediente(expediente, new Date(), MINUTOS_PARA_RESPONDER);

  // O CURSOR ANDA NA MESMA TRANSAÇÃO da atribuição, pela mesma razão de transferirLead: se
  // andasse depois, uma falha no meio deixaria a mesma pessoa recebendo o próximo lead também, e
  // o rodízio viraria cascata sem ninguém perceber.
  await prisma.$transaction([
    prisma.attendance.update({
      where: { id: lead.id },
      data: {
        responsibleId: proximo.id,
        prazoDeRespostaAte: prazo,
        filaJaTentou: anotarTentativa(jaTentaram, proximo.id),
      },
    }),
    prisma.whatsappConfig.update({
      where: { officeId: lead.officeId },
      data: tipo === "ADVOGADOS" ? { ultimoAdvogadoId: proximo.id } : { ultimaRecepcaoId: proximo.id },
    }),
  ]);

  await empurrarParaAguardando(lead);

  const aviso = await avisarAdvogadoDoLead(lead.id, proximo.id, (lead.transferidoPor as GatilhoDaTransferencia) ?? "ROTEIRO");
  return `repassado para ${proximo.nome} — ${aviso.motivo}`;
}

export async function repassarLeadsSemResposta(): Promise<{
  vencidos: number;
  repassados: number;
  atendidos: number;
  semResposta: number;
  falhas: number;
}> {
  const agora = new Date();
  const vencidos = (await prisma.attendance.findMany({
    where: {
      prazoDeRespostaAte: { lte: agora },
      transferidoEm: { not: null },
      semRespostaEm: null,
      // Humano já assumiu a conversa: o relógio não tem mais nada a fazer aqui.
      agenteSilenciadoEm: null,
      status: { notIn: ["ARQUIVADO", "CONVERTIDO", "RASCUNHO", "RECUSADO"] },
    },
    orderBy: { prazoDeRespostaAte: "asc" },
    take: 200,
    select: {
      id: true,
      officeId: true,
      transferidoEm: true,
      transferidoPor: true,
      responsibleId: true,
      filaJaTentou: true,
      firstResponseAt: true,
      stage: true,
      campanha: { select: { destino: true } },
    },
  })) as LeadVencido[];

  let repassados = 0;
  let atendidos = 0;
  let semResposta = 0;
  let falhas = 0;

  for (const lead of vencidos) {
    try {
      const resultado = await tratarUmLead(lead);
      if (resultado.startsWith("repassado")) repassados += 1;
      else if (resultado.startsWith("atendido")) atendidos += 1;
      else semResposta += 1;
      console.log(`[repasse] ${lead.id}: ${resultado}`);
    } catch (erro) {
      falhas += 1;
      console.error(`[repasse] ${lead.id} falhou:`, mensagemDeErro(erro));
    }
  }

  return { vencidos: vencidos.length, repassados, atendidos, semResposta, falhas };
}
