import { prisma, prismaBase } from "@/lib/prisma";
import {
  type RecordScopeType,
  isRecordInOffice,
  revealFieldsFor,
} from "@/lib/recordScope";
import { ACCESS_REASONS, SESSION_MINUTES, type AccessReasonCode } from "@/lib/supportAccessConstants";

// ============================================================================
// Quebra-vidro POR REGISTRO (Fase B). Núcleo, sem "use server" e sem cookies().
// ============================================================================
//
// Por que separado de lib/actions/breakGlass.ts (que TEM "use server" e resolve `viewer` via
// getCurrentUser()/cookies()): o mesmo motivo de lib/supportAccess.ts vs lib/actions/
// supportAccess.ts — este arquivo recebe identidade (officeId, memberId) já resolvida, em vez de
// resolvê-la sozinho. Duas vantagens:
//   1. Pode ser testado sem contexto de requisição HTTP (ver scripts/testar-quebra-vidro.ts) —
//      cookies() lança fora de uma requisição, então qualquer coisa que dependesse dele não
//      daria para provar de forma executável.
//   2. Mantém num único lugar (lib/actions/breakGlass.ts) a responsabilidade de decidir QUEM
//      está chamando — este arquivo só decide O QUE essa identidade tem permissão de fazer.
//
// DESENHO (o que este arquivo NÃO faz, de propósito): não tenta desmascarar dentro da extensão
// do Prisma (lib/prisma.ts) nem consulta o banco de lá — isso reintroduziria exatamente a
// recursão que lib/supportContext.ts evita (ver o comentário longo lá). A revelação aqui é um
// ATO EXPLÍCITO, fora da extensão, que só lê alguma coisa depois de confirmar sessão + aprovação
// e só devolve o dado se o log da leitura também foi gravado.

export type RevealResult = { error?: string; data?: Record<string, unknown> };
export type RequestAccessResult = { error?: string; requestId?: string };

class NotFoundError extends Error {}

// Sessão de suporte ATIVA (não encerrada, não expirada) deste membro para este escritório —
// mesma forma de AccessSession que lib/supportAccess.ts:getActiveSupportSession consulta, só que
// filtrando também por memberId (aqui interessa "este membro está numa sessão", não "existe
// alguma sessão ativa no escritório").
async function findActiveSession(officeId: string, memberId: string) {
  return prisma.accessSession.findFirst({
    where: { memberId, endedAt: null, expiresAt: { gt: new Date() }, request: { officeId } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
}

// Revela UM registro (scopeType + scopeId), autorizado por UM AccessRequest APROVADO com
// EXATAMENTE aquele escopo, pedido pelo MESMO membro que está com a sessão ativa. "Falha fecha":
// qualquer uma das confirmações falhando (sessão, pedido, leitura, log) devolve erro — nunca
// dado parcial.
//
// Passo a passo, na ordem exigida pela Fase B:
//   1. confirma AccessSession ativa e não expirada para o escritório (e, reforço deliberado,
//      para o MESMO membro — ver comentário abaixo);
//   2. confirma AccessRequest APROVADO, ainda no prazo, com scopeType+scopeId EXATOS;
//   3. lê o registro pelo client BASE (prismaBase), sem a extensão de máscara;
//   4. grava AccessAuditLog (action: "LEITURA") NA MESMA TRANSAÇÃO da leitura — se o log não
//      grava, a transação inteira desfaz e a leitura não sai desta função;
//   5. devolve só os campos mascarados daquele model (ver lib/recordScope.ts:revealFieldsFor),
//      nunca o registro inteiro nem relações.
export async function revealRecord(input: {
  officeId: string;
  memberId: string;
  scopeType: RecordScopeType;
  scopeId: string;
}): Promise<RevealResult> {
  const { officeId, memberId, scopeType, scopeId } = input;
  const now = new Date();

  // 1) Sessão ativa. Exigir que seja do MESMO memberId (e não "qualquer sessão ativa deste
  // escritório") é mais estrito do que o mínimo pedido pela Fase B — reforço deliberado: a
  // aprovação de quebra-vidro é para quem pediu, não um cheque em branco que qualquer sessão de
  // suporte aberta no escritório possa sacar.
  const session = await findActiveSession(officeId, memberId);
  if (!session) return { error: "Não há sessão de suporte ativa para este escritório." };

  // 2) AccessRequest APROVADO, ainda no prazo, com escopo EXATO — e do mesmo requester, mesmo
  // motivo acima.
  const approved = await prisma.accessRequest.findFirst({
    where: {
      officeId,
      requesterId: memberId,
      scopeType,
      scopeId,
      status: "APROVADO",
      expiresAt: { gt: now },
    },
    orderBy: { decidedAt: "desc" },
    select: { id: true },
  });
  if (!approved) return { error: "Nenhum pedido de acesso aprovado para este registro." };

  // 3+4) Leitura pelo client BASE + log LEITURA, atômico.
  const fields = revealFieldsFor(scopeType);
  if (fields.length === 0) return { error: "Este tipo de registro não tem campos a revelar." };
  const select = Object.fromEntries(fields.map((f) => [f, true] as const));

  try {
    const data = await prismaBase.$transaction(async (tx) => {
      let record: Record<string, unknown> | null;
      switch (scopeType) {
        case "CASE":
          record = await tx.case.findFirst({ where: { id: scopeId, officeId }, select });
          break;
        case "PAYABLE":
          record = await tx.payable.findFirst({ where: { id: scopeId, officeId }, select });
          break;
        case "RECEIVABLE":
          record = await tx.receivable.findFirst({ where: { id: scopeId, officeId }, select });
          break;
        case "ATTENDANCE":
          record = await tx.attendance.findFirst({ where: { id: scopeId, officeId }, select });
          break;
      }
      if (!record) throw new NotFoundError();

      // AccessAuditLog é a prova de que este registro foi visto de verdade. Se este INSERT
      // falhar, o throw desfaz o $transaction inteiro — a leitura acima nunca sai desta função.
      await tx.accessAuditLog.create({
        data: { officeId, memberId, action: "LEITURA", scopeType, scopeId, sessionId: session.id },
      });

      return record;
    });
    return { data };
  } catch (err) {
    if (err instanceof NotFoundError) return { error: "Registro não encontrado neste escritório." };
    console.error("revealRecord: falha ao revelar — nenhum dado foi devolvido", err);
    return { error: "Não foi possível registrar a leitura; por segurança, o dado não foi revelado." };
  }
}

// Cria um AccessRequest PENDENTE com o escopo REAL (scopeType + scopeId de um registro
// específico) — nunca mais "CONFIGURACAO". É um pedido ADICIONAL de dentro de uma sessão de
// suporte já aberta (não abre sessão nova, não mexe em openSupportAccess): reaproveita o
// SupportTicket da AccessSession ativa deste membro para este escritório.
export async function requestRecordAccess(input: {
  officeId: string;
  memberId: string;
  scopeType: RecordScopeType;
  scopeId: string;
  reasonCode: AccessReasonCode;
  reasonNote?: string;
}): Promise<RequestAccessResult> {
  const { officeId, memberId, scopeType, scopeId, reasonCode, reasonNote } = input;

  if (!(reasonCode in ACCESS_REASONS)) return { error: "Motivo inválido." };

  // O registro precisa existir e pertencer a ESTE escritório — nunca confiar num scopeId vindo
  // do client sem checar posse (mesmo padrão de lib/officeScope.ts).
  const inOffice = await isRecordInOffice(scopeType, scopeId, officeId);
  if (!inOffice) return { error: "Registro não encontrado neste escritório." };

  const now = new Date();

  const session = await prisma.accessSession.findFirst({
    where: { memberId, endedAt: null, expiresAt: { gt: now }, request: { officeId } },
    orderBy: { startedAt: "desc" },
    include: { request: { select: { ticketId: true } } },
  });
  if (!session) return { error: "Não há sessão de suporte ativa para este escritório." };

  // Já existe pedido PENDENTE ou já APROVADO (ainda no prazo) deste membro para este MESMO
  // registro? Não duplica — se já está aprovado, devolve o id existente (idempotente); se ainda
  // está pendente, avisa em vez de criar um segundo pedido igual.
  const existing = await prisma.accessRequest.findFirst({
    where: { officeId, requesterId: memberId, scopeType, scopeId, status: { in: ["PENDENTE", "APROVADO"] }, expiresAt: { gt: now } },
    orderBy: { requestedAt: "desc" },
  });
  if (existing) {
    if (existing.status === "APROVADO") return { requestId: existing.id };
    return { error: "Já existe um pedido pendente para este registro." };
  }

  // Mesmo prazo de qualquer outro AccessRequest (SESSION_MINUTES) — não é um prazo próprio de
  // quebra-vidro, é o mesmo contrato de expiração que o resto do sistema já usa.
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000);

  try {
    const created = await prisma.accessRequest.create({
      data: {
        officeId,
        requesterId: memberId,
        ticketId: session.request.ticketId,
        reasonCode,
        reasonNote,
        scopeType,
        scopeId,
        status: "PENDENTE",
        expiresAt,
      },
    });
    return { requestId: created.id };
  } catch (err) {
    console.error("requestRecordAccess: falha ao registrar o pedido", err);
    return { error: "Não foi possível registrar o pedido." };
  }
}
