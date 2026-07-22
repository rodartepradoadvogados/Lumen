"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getOrCreateAssessoriaCompanyFolder } from "@/lib/googleDrive";
import { markReceivablePaid } from "@/lib/actions/financeiro";

export async function listAssessorias() {
  return prisma.assessoria.findMany({
    include: {
      client: true,
      _count: { select: { licitacoes: true, documents: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAssessoria(data: {
  clientId: string;
  monthlyFee: string;
  dueDay: string;
  responsibleId?: string;
}): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) return { error: "Cliente não encontrado." };

  const existing = await prisma.assessoria.findUnique({ where: { clientId: data.clientId } });
  if (existing) return { error: "Esta empresa já tem uma assessoria cadastrada." };

  // Cria a estrutura de pastas no Drive de forma best-effort — se o Drive não estiver
  // conectado ou a chamada falhar, a Assessoria é criada normalmente mesmo assim (o
  // catálogo de Documentos só usa link colado, não depende da pasta existir).
  let driveFolderId: string | null = null;
  try {
    driveFolderId = await getOrCreateAssessoriaCompanyFolder(client.name);
  } catch {
    driveFolderId = null;
  }

  const created = await prisma.assessoria.create({
    data: {
      clientId: data.clientId,
      monthlyFee: parseFloat(data.monthlyFee),
      dueDay: Math.min(28, Math.max(1, parseInt(data.dueDay) || 5)),
      responsibleId: data.responsibleId || null,
      driveFolderId,
    },
  });
  revalidatePath("/assessoria");
  redirect(`/assessoria/${created.id}`);
}

export async function updateAssessoria(
  id: string,
  data: { monthlyFee?: string; dueDay?: string; status?: string; responsibleId?: string; planningNotes?: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  await prisma.assessoria.update({
    where: { id },
    data: {
      monthlyFee: data.monthlyFee !== undefined ? parseFloat(data.monthlyFee) : undefined,
      dueDay: data.dueDay !== undefined ? Math.min(28, Math.max(1, parseInt(data.dueDay) || 5)) : undefined,
      status: data.status,
      responsibleId: data.responsibleId !== undefined ? data.responsibleId || null : undefined,
      planningNotes: data.planningNotes !== undefined ? data.planningNotes || null : undefined,
    },
  });
  revalidatePath(`/assessoria/${id}`);
  revalidatePath("/assessoria");
  return {};
}

export async function getAssessoriaDetail(id: string) {
  const assessoria = await prisma.assessoria.findUnique({
    where: { id },
    include: {
      client: true,
      responsible: true,
      documents: { orderBy: { date: "desc" }, include: { uploadedBy: true, case: true } },
      honorarios: { orderBy: { competencia: "desc" }, include: { receivable: true } },
      licitacoes: { orderBy: { createdAt: "desc" }, include: { tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } } } },
    },
  });
  if (!assessoria) return null;

  // "Vinculado" tem duas origens: vínculo explícito (assessoriaId, escolhido no cadastro do
  // processo) ou o mesmo cliente da assessoria (comportamento legado, filtro por clientId).
  const linkedCases = await prisma.case.findMany({
    where: { OR: [{ assessoriaId: id }, { clientId: assessoria.clientId }] },
    orderBy: { updatedAt: "desc" },
  });

  const linkedAttendances = await prisma.attendance.findMany({
    where: { assessoriaId: id },
    orderBy: { createdAt: "desc" },
  });

  return { ...assessoria, linkedCases, linkedAttendances };
}

export async function addDocumento(
  assessoriaId: string,
  data: { name: string; docType: string; driveUrl: string; date?: string; caseId?: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!data.name.trim() || !data.driveUrl.trim()) return { error: "Preencha o nome e o link do Google Drive." };

  await prisma.assessoriaDocumento.create({
    data: {
      assessoriaId,
      name: data.name.trim(),
      docType: data.docType,
      driveUrl: data.driveUrl.trim(),
      date: data.date ? new Date(data.date) : new Date(),
      caseId: data.caseId || null,
      uploadedById: user.id,
    },
  });
  revalidatePath(`/assessoria/${assessoriaId}`);
  return {};
}

export async function addLicitacao(
  assessoriaId: string,
  data: {
    objeto: string;
    orgao: string;
    modalidade?: string;
    dataAbertura?: string;
    prazoFinal?: string;
    valorEstimado?: string;
    editalUrl?: string;
  }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!data.objeto.trim() || !data.orgao.trim()) return { error: "Preencha ao menos o objeto e o órgão." };

  await prisma.licitacao.create({
    data: {
      assessoriaId,
      objeto: data.objeto.trim(),
      orgao: data.orgao.trim(),
      modalidade: data.modalidade || null,
      dataAbertura: data.dataAbertura ? new Date(data.dataAbertura) : null,
      prazoFinal: data.prazoFinal ? new Date(data.prazoFinal) : null,
      valorEstimado: data.valorEstimado ? parseFloat(data.valorEstimado) : null,
      editalUrl: data.editalUrl || null,
    },
  });
  revalidatePath(`/assessoria/${assessoriaId}`);
  return {};
}

export async function updateLicitacaoStatus(licitacaoId: string, status: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const licitacao = await prisma.licitacao.update({ where: { id: licitacaoId }, data: { status } });
  revalidatePath(`/assessoria/${licitacao.assessoriaId}`);
  return {};
}

export async function addLicitacaoTask(
  licitacaoId: string,
  data: { title: string; dueDate: string; dueTime?: string; responsibleId?: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!data.title.trim() || !data.dueDate) return { error: "Preencha o título e o prazo." };

  const licitacao = await prisma.licitacao.findUnique({ where: { id: licitacaoId } });
  if (!licitacao) return { error: "Licitação não encontrada." };

  await prisma.task.create({
    data: {
      title: data.title.trim(),
      type: "PRAZO",
      dueDate: new Date(data.dueDate),
      dueTime: data.dueTime || null,
      responsibleId: data.responsibleId || null,
      licitacaoId,
    },
  });
  revalidatePath(`/assessoria/${licitacao.assessoriaId}`);
  revalidatePath("/agenda");
  return {};
}

// Reaproveita a mesma lógica de baixa de Contas a Receber — o Honorario só "marca" qual
// Receivable é a mensalidade de uma competência específica da assessoria.
export async function markHonorarioPaid(honorarioId: string, paidAmount: number, paidDate: string): Promise<{ error?: string }> {
  const honorario = await prisma.honorario.findUnique({ where: { id: honorarioId } });
  if (!honorario) return { error: "Honorário não encontrado." };
  await markReceivablePaid(honorario.receivableId, paidAmount, paidDate);
  revalidatePath(`/assessoria/${honorario.assessoriaId}`);
  return {};
}

// Chamado pelo cron mensal (app/api/cron/assessoria-honorarios/route.ts). Gera, para cada
// assessoria ativa, o Honorario + Receivable do mês corrente, se ainda não existir — nunca
// duplica (protegido pela constraint única assessoriaId+competencia).
export async function generateAllMonthlyHonorarios(): Promise<{ created: number }> {
  const now = new Date();
  const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const assessorias = await prisma.assessoria.findMany({ where: { status: "ATIVA" }, include: { client: true } });

  let created = 0;
  for (const a of assessorias) {
    const exists = await prisma.honorario.findUnique({
      where: { assessoriaId_competencia: { assessoriaId: a.id, competencia } },
    });
    if (exists) continue;

    const dueDate = new Date(now.getFullYear(), now.getMonth(), a.dueDay);
    const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const receivable = await prisma.receivable.create({
      data: {
        description: `Honorário de assessoria — ${a.client.name} — ${monthLabel}`,
        amount: a.monthlyFee,
        dueDate,
        kind: "HONORARIOS_CONTRATUAIS",
        clientId: a.clientId,
      },
    });
    await prisma.honorario.create({ data: { assessoriaId: a.id, competencia, receivableId: receivable.id } });
    created++;
  }

  revalidatePath("/assessoria");
  return { created };
}
