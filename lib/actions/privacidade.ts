"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { revalidatePath } from "next/cache";

// Documento 07 (Fase 4 — Privacidade e LGPD): trilha de auditoria (AuditEvent, ver PR19/lib/
// actions/mask.ts) e pedido do titular (DataSubjectRequest, LGPD art. 18).

export type AuditEventRow = {
  id: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  field: string | null;
  reason: string | null;
  createdAt: string;
  actorName: string;
};

// "Exclusões" da trilha (documento 07) agrupa os dois desfechos que de fato apagam/rescrevem
// dado pessoal — exclusão e anonimização — sob um rótulo só, mesmo padrão da lista de abas do
// documento (que não separa "Anonimizações" numa 5ª aba).
const KIND_GROUPS: Record<"REVELACAO" | "EXPORTACAO" | "EXCLUSAO", string[]> = {
  REVELACAO: ["REVELACAO"],
  EXPORTACAO: ["EXPORTACAO"],
  EXCLUSAO: ["EXCLUSAO", "ANONIMIZACAO"],
};

export async function listAuditEvents(aba: "REVELACAO" | "EXPORTACAO" | "EXCLUSAO"): Promise<AuditEventRow[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const rows = await prisma.auditEvent.findMany({
    where: { officeId: viewer.officeId, kind: { in: KIND_GROUPS[aba] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    entityType: r.entityType,
    entityId: r.entityId,
    field: r.field,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    actorName: r.actor.name,
  }));
}

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

// Gera o CSV da aba pedida E grava a própria exportação na trilha (documento 07: "a exportação
// da trilha entra na própria trilha") — nesta ordem: consulta primeiro, grava o evento depois,
// pra o evento de exportação não aparecer no CSV que ele mesmo gerou.
export async function exportarTrilha(aba: "REVELACAO" | "EXPORTACAO" | "EXCLUSAO", abaLabel: string): Promise<{ error?: string; csv?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const rows = await listAuditEvents(aba);
  const header = ["Data/hora", "Quem", "O que", "Registro afetado", "Campo", "Motivo"];
  const linhas = rows.map((r) =>
    [
      new Date(r.createdAt).toLocaleString("pt-BR"),
      r.actorName,
      r.kind,
      r.entityType && r.entityId ? `${r.entityType}:${r.entityId}` : "",
      r.field ?? "",
      r.reason ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  const csv = [header.map(csvEscape).join(","), ...linhas].join("\n");

  await prisma.auditEvent.create({
    data: { officeId: viewer.officeId, actorId: viewer.id, kind: "EXPORTACAO", reason: `Exportação da aba "${abaLabel}" da trilha de auditoria` },
  });
  revalidatePath("/configuracoes/privacidade");

  return { csv };
}

export type DataSubjectRequestRow = {
  id: string;
  subjectName: string;
  subjectDoc: string | null;
  kind: string;
  channel: string;
  receivedAt: string;
  dueAt: string;
  status: string;
  decision: string | null;
  executedAt: string | null;
};

export async function listPedidosTitular(): Promise<DataSubjectRequestRow[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const rows = await prisma.dataSubjectRequest.findMany({
    where: { officeId: viewer.officeId },
    orderBy: { receivedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    subjectName: r.subjectName,
    subjectDoc: r.subjectDoc,
    kind: r.kind,
    channel: r.channel,
    receivedAt: r.receivedAt.toISOString(),
    dueAt: r.dueAt.toISOString(),
    status: r.status,
    decision: r.decision,
    executedAt: r.executedAt ? r.executedAt.toISOString() : null,
  }));
}

const PRAZO_DIAS = 15;

export async function abrirPedidoTitular(input: {
  subjectName: string;
  subjectDoc?: string;
  kind: string;
  channel: string;
  receivedAt: string; // AAAA-MM-DD
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem abrir um pedido do titular." };
  if (!input.subjectName.trim()) return { error: "Nome do titular é obrigatório." };
  if (!input.channel.trim()) return { error: "Canal de origem é obrigatório." };

  const recebidoEm = new Date(`${input.receivedAt}T00:00:00.000Z`);
  if (Number.isNaN(recebidoEm.getTime())) return { error: "Data de recebimento inválida." };
  const prazo = new Date(recebidoEm.getTime() + PRAZO_DIAS * 24 * 60 * 60 * 1000);

  await prisma.dataSubjectRequest.create({
    data: {
      officeId: viewer.officeId,
      subjectName: input.subjectName.trim(),
      subjectDoc: input.subjectDoc?.trim() || null,
      kind: input.kind,
      channel: input.channel.trim(),
      receivedAt: recebidoEm,
      dueAt: prazo,
      status: "ABERTO",
      createdById: viewer.id,
    },
  });
  revalidatePath("/configuracoes/privacidade");
  return {};
}

export async function avaliarPedidoTitular(id: string, status: "EM_ANALISE" | "RECUSADO", decision: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem avaliar um pedido do titular." };
  if (!decision.trim()) return { error: "Registre a análise (há dever legal de guarda? processo em curso?)." };

  const pedido = await prisma.dataSubjectRequest.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!pedido) return { error: "Pedido não encontrado." };

  await prisma.dataSubjectRequest.update({ where: { id }, data: { status, decision: decision.trim() } });
  revalidatePath("/configuracoes/privacidade");
  return {};
}

// Marca o pedido como executado e registra na trilha (kind = EXCLUSAO ou ANONIMIZACAO, conforme
// o tipo do pedido). A EXECUÇÃO DE VERDADE (apagar/anonimizar o cadastro do titular nos models de
// negócio — Client/Case/CaseParty etc., preservando o que a lei obriga a manter) fica de fora
// desta PR de propósito: a decisão de o que exatamente pode ser apagado/substituído em cada tipo
// de registro é caso a caso e não deve ser automatizada por um dispatcher genérico — quem executa
// o pedido faz a alteração no cadastro (Contatos, Processo etc.) pelas telas normais e só então
// marca aqui como executado, com o resumo do que foi feito no campo `decision`.
export async function executarPedidoTitular(id: string, resumoExecucao: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem executar um pedido do titular." };
  if (!resumoExecucao.trim()) return { error: "Descreva o que foi substituído/excluído antes de marcar como executado." };

  const pedido = await prisma.dataSubjectRequest.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!pedido) return { error: "Pedido não encontrado." };

  const auditKind = pedido.kind === "ANONIMIZACAO" ? "ANONIMIZACAO" : "EXCLUSAO";

  await prisma.$transaction([
    prisma.dataSubjectRequest.update({
      where: { id },
      data: { status: "EXECUTADO", executedAt: new Date(), decision: resumoExecucao.trim() },
    }),
    prisma.auditEvent.create({
      data: {
        officeId: viewer.officeId,
        actorId: viewer.id,
        kind: auditKind,
        entityType: "DataSubjectRequest",
        entityId: id,
        reason: resumoExecucao.trim(),
      },
    }),
  ]);
  revalidatePath("/configuracoes/privacidade");
  return {};
}
