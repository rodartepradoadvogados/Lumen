import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getPlatformMember } from "@/lib/platformMember";
import { ACCESS_REASONS, SESSION_MINUTES, type AccessReasonCode } from "@/lib/supportAccessConstants";

// Passo 2 da fundação de dados da Lúmen: este módulo é o ÚNICO caminho de elevação pra "atuar
// como" outro escritório. Se um dia existir um segundo caminho que grave AccessSession sem
// passar por aqui, o controle inteiro vira decoração — qualquer chamador (lib/officeActing.ts
// hoje, uma futura tela de suporte depois) precisa passar por openSupportAccess/
// closeSupportAccess, nunca escrever essas tabelas diretamente.
//
// Não importa getCurrentUser de lib/currentUser.ts de propósito: lib/currentUser.ts precisa
// chamar getActiveSupportSession() (pra decidir se aplica o override de "atuar como"), e um
// import de volta pra cá criaria um ciclo entre os dois módulos. Resolve a identidade "crua" do
// jeito que lib/platformMember.ts já faz (cookie de sessão + verifySession + User), sem passar
// pelo override de escritório. lib/platformMember.ts pode ser importado normalmente aqui — ele
// não depende de lib/currentUser.ts nem deste módulo, então não fecha ciclo nenhum.

type CallingMember = { id: string; name: string };

// Identidade real de quem está chamando (ignora qualquer cookie de "atuar como" — não faria
// sentido abrir um acesso de suporte em nome de quem já está impersonando outro escritório).
async function getRealUser(): Promise<{ id: string; name: string; isPlatformOwner: boolean } | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, isPlatformOwner: true },
  });
  return user;
}

// Quem pode abrir uma sessão de suporte: um PlatformMember ativo através do contexto Lúmen
// (getPlatformMember, Passo 1) OU, como ponte temporária enquanto não existe tela de troca de
// contexto pro "atuar como" (isso chega no Passo 3), o platform owner "cru" (User.isPlatformOwner)
// — nesse caso resolve/cria a linha de PlatformMember dele na hora, com o mesmo papel SOCIO que
// /api/admin/setup-lumen usa, pra nunca travar o dono da plataforma por causa de um passo de
// setup que não rodou.
async function resolveCallingMember(): Promise<CallingMember | null> {
  const platformViewer = await getPlatformMember();
  if (platformViewer) return { id: platformViewer.id, name: platformViewer.name };

  const realUser = await getRealUser();
  if (!realUser?.isPlatformOwner) return null;

  const existing = await prisma.platformMember.findUnique({ where: { userId: realUser.id } });
  if (existing) {
    if (!existing.active) return null;
    return { id: existing.id, name: realUser.name };
  }

  // Nunca existiu (o setup de fundação da Lúmen ainda não rodou pra este usuário) — cria agora
  // com papel SOCIO, mesmo comportamento do setup manual, só que sob demanda, pra não travar o
  // dono da plataforma esperando alguém rodar /api/admin/setup-lumen.
  let socioRole = await prisma.platformRole.findUnique({ where: { key: "SOCIO" } });
  if (!socioRole) {
    socioRole = await prisma.platformRole.create({
      data: {
        key: "SOCIO",
        name: "Sócio",
        maxVisibility: "QUEBRA_VIDRO",
        canManageBilling: true,
        canManageMembers: true,
        canApproveAccess: true,
      },
    });
  }
  const created = await prisma.platformMember.create({ data: { userId: realUser.id, roleId: socioRole.id } });
  return { id: created.id, name: realUser.name };
}

// Abre a sessão: valida, grava AccessRequest + AccessSession + AccessAuditLog numa única
// transação e só então devolve sessionId. Se a transação falhar, devolve erro e NADA de
// cookie é gravado por quem chama (lib/officeActing.ts) — falha fecha, nunca abre.
export async function openSupportAccess(input: {
  officeId: string;
  reasonCode: AccessReasonCode;
  reasonNote?: string;
  ticketSubject: string; // cria o SupportTicket daquele escritório se não vier ticketId
  ticketId?: string;
}): Promise<{ error?: string; sessionId?: string }> {
  const member = await resolveCallingMember();
  if (!member) return { error: "Sem permissão de suporte da Lúmen para abrir este acesso." };

  if (!(input.reasonCode in ACCESS_REASONS)) return { error: "Motivo inválido." };

  const subject = input.ticketSubject?.trim();
  if (!input.ticketId && !subject) return { error: "Informe o assunto do chamado." };

  const office = await prisma.office.findUnique({
    where: { id: input.officeId },
    select: { id: true, supportAccessPolicy: true },
  });
  if (!office) return { error: "Escritório não encontrado." };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000);

  try {
    // Chamado obrigatório e verificável: precisa existir, estar aberto e ser DAQUELE escritório
    // (ver comentário de AccessRequest.ticketId no schema) — reaproveita se veio um ticketId,
    // senão abre um novo.
    const ticket = input.ticketId
      ? await prisma.supportTicket.findUnique({ where: { id: input.ticketId } })
      : await prisma.supportTicket.create({
          data: { officeId: input.officeId, subject: subject!, status: "EM_ANDAMENTO" },
        });
    if (!ticket || ticket.officeId !== input.officeId) {
      return { error: "Chamado não encontrado ou de outro escritório." };
    }

    if (office.supportAccessPolicy === "APROVACAO") {
      // Escritório optou por exigir liberação de um sócio antes do acesso — registra o pedido
      // como PENDENTE e para por aqui, sem abrir sessão nenhuma. Fora da transação abaixo de
      // propósito: este registro PENDENTE precisa sobreviver mesmo sem sessão sendo aberta (não
      // é "tudo ou nada" com AccessSession/AccessAuditLog, é um caminho totalmente separado). A
      // tela de aprovação do lado do escritório é o Passo 3; até lá, o caminho certo é negar a
      // elevação automática e deixar o pedido registrado para consulta.
      await prisma.accessRequest.create({
        data: {
          officeId: input.officeId,
          requesterId: member.id,
          ticketId: ticket.id,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote,
          scopeType: "CONFIGURACAO",
          scopeId: input.officeId,
          status: "PENDENTE",
          expiresAt,
        },
      });
      return {
        error:
          "Este escritório exige aprovação de um sócio antes do acesso de suporte. O pedido foi registrado, mas ainda não existe tela de liberação (chega no Passo 3) — combine diretamente com o escritório.",
      };
    }

    // Caminho AUTO: AccessRequest (já aprovado, sem aprovador humano — é a política do próprio
    // escritório que autoriza) + AccessSession + AccessAuditLog (ENTRADA) numa única transação.
    // Falhou qualquer parte, falha tudo — é assim que "falha fecha" vira garantia de verdade em
    // vez de intenção.
    const session = await prisma.$transaction(async (tx) => {
      const request = await tx.accessRequest.create({
        data: {
          officeId: input.officeId,
          requesterId: member.id,
          ticketId: ticket.id,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote,
          scopeType: "CONFIGURACAO",
          scopeId: input.officeId,
          status: "APROVADO",
          approvedByUserId: null,
          decidedAt: now,
          expiresAt,
        },
      });

      const createdSession = await tx.accessSession.create({
        data: { requestId: request.id, memberId: member.id, startedAt: now, expiresAt },
      });

      await tx.accessAuditLog.create({
        data: {
          officeId: input.officeId,
          memberId: member.id,
          action: "ENTRADA",
          reasonCode: input.reasonCode,
          scopeType: "CONFIGURACAO",
          scopeId: input.officeId,
          sessionId: createdSession.id,
        },
      });

      return createdSession;
    });

    return { sessionId: session.id };
  } catch (err) {
    console.error("openSupportAccess: falha ao registrar o acesso — nenhuma sessão foi liberada", err);
    return { error: "Não foi possível registrar o acesso; por segurança, o acesso não foi liberado." };
  }
}

// Sessão ativa e não expirada daquele escritório, ou null. Usada tanto para autorizar o
// override em lib/currentUser.ts quanto para desenhar a faixa do lado do escritório
// (components/SupportAccessBanner.tsx) e a página de transparência.
export async function getActiveSupportSession(officeId: string): Promise<{
  id: string;
  memberName: string;
  reasonCode: string;
  startedAt: Date;
  expiresAt: Date;
} | null> {
  const session = await prisma.accessSession.findFirst({
    where: {
      endedAt: null,
      expiresAt: { gt: new Date() },
      request: { officeId },
    },
    orderBy: { startedAt: "desc" },
    include: {
      request: { select: { reasonCode: true } },
      member: { select: { name: true, user: { select: { name: true } } } },
    },
  });
  if (!session) return null;

  return {
    id: session.id,
    memberName: session.member.user?.name ?? session.member.name ?? "Suporte Lúmen",
    reasonCode: session.request.reasonCode,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
  };
}

// Encerra. endedBy: "MEMBRO" | "ESCRITORIO" | "EXPIRACAO". Grava SAIDA no log. Idempotente:
// chamar de novo numa sessão já encerrada não faz nada (nem lança erro) — quem chama (botão
// "Encerrar agora" do escritório, ou stopActingAsOffice do membro) não deveria travar por causa
// de uma corrida entre os dois lados encerrando ao mesmo tempo.
export async function closeSupportAccess(sessionId: string, endedBy: string): Promise<void> {
  const session = await prisma.accessSession.findUnique({
    where: { id: sessionId },
    include: { request: true },
  });
  if (!session || session.endedAt) return;

  await prisma.$transaction([
    prisma.accessSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date(), endedBy },
    }),
    // AccessAuditLog é só inclusão — nunca update/delete. Este INSERT é o registro de saída.
    prisma.accessAuditLog.create({
      data: {
        officeId: session.request.officeId,
        memberId: session.memberId,
        action: "SAIDA",
        reasonCode: session.request.reasonCode,
        scopeType: session.request.scopeType,
        scopeId: session.request.scopeId,
        sessionId: session.id,
        detail: endedBy,
      },
    }),
  ]);
}

export type OfficeAccessLogEntry = {
  id: string;
  createdAt: Date;
  memberName: string;
  reasonLabel: string;
  action: string;
  outOfBand: boolean;
  durationMinutes: number | null;
};

// Histórico para a página de transparência do escritório (app/(app)/configuracoes/acessos).
// Somente leitura — nada aqui apaga ou edita linha de AccessAuditLog.
export async function listOfficeAccessLog(officeId: string, days = 90): Promise<OfficeAccessLogEntry[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = await prisma.accessAuditLog.findMany({
    where: { officeId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { member: { select: { name: true, user: { select: { name: true } } } } },
  });

  // Duração: casa cada ENTRADA com a AccessSession referenciada (sessionId) pra achar
  // início/fim reais, em vez de recalcular só pelo prazo teórico.
  const sessionIds = [...new Set(logs.map((l) => l.sessionId).filter((id): id is string => Boolean(id)))];
  const sessions = sessionIds.length
    ? await prisma.accessSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, startedAt: true, endedAt: true, expiresAt: true },
      })
    : [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  return logs.map((log) => {
    const session = log.sessionId ? sessionById.get(log.sessionId) : undefined;
    const durationMinutes =
      log.action === "ENTRADA" && session
        ? Math.max(0, Math.round(((session.endedAt ?? session.expiresAt).getTime() - session.startedAt.getTime()) / 60_000))
        : null;

    return {
      id: log.id,
      createdAt: log.createdAt,
      memberName: log.member?.user?.name ?? log.member?.name ?? "Suporte Lúmen",
      reasonLabel: (log.reasonCode && ACCESS_REASONS[log.reasonCode as AccessReasonCode]) || log.reasonCode || "—",
      action: log.action,
      outOfBand: log.outOfBand,
      durationMinutes,
    };
  });
}
