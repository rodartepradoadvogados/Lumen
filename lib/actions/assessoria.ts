"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getOrCreateAssessoriaCompanyFolder, getOrCreateParecerFolder } from "@/lib/storageProvider";
import { markReceivablePaid } from "@/lib/actions/financeiro";
import { isUserInOffice, isCaseInOffice } from "@/lib/officeScope";
import { getOfficeModules } from "@/lib/officeModules";

export async function listAssessorias() {
  const user = await getCurrentUser();
  if (!user) return [];
  return prisma.assessoria.findMany({
    where: { officeId: user.officeId },
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
  if (!(await getOfficeModules(user.officeId)).assessoria) {
    return { error: "O módulo Assessoria Jurídica não está incluído no plano deste escritório." };
  }

  const client = await prisma.client.findFirst({ where: { id: data.clientId, officeId: user.officeId } });
  if (!client) return { error: "Cliente não encontrado." };

  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, user.officeId))) {
    return { error: "Responsável não encontrado." };
  }

  const existing = await prisma.assessoria.findFirst({ where: { clientId: data.clientId, officeId: user.officeId } });
  if (existing) return { error: "Esta empresa já tem uma assessoria cadastrada." };

  // Cria a estrutura de pastas no Drive de forma best-effort — se o Drive não estiver
  // conectado ou a chamada falhar, a Assessoria é criada normalmente mesmo assim (o
  // catálogo de Documentos só usa link colado, não depende da pasta existir).
  let driveFolderId: string | null = null;
  try {
    driveFolderId = await getOrCreateAssessoriaCompanyFolder(client.name, user.officeId);
  } catch {
    driveFolderId = null;
  }

  const created = await prisma.assessoria.create({
    data: {
      officeId: user.officeId,
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

  const existing = await prisma.assessoria.findFirst({ where: { id, officeId: user.officeId } });
  if (!existing) return { error: "Assessoria não encontrada." };

  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, user.officeId))) {
    return { error: "Responsável não encontrado." };
  }

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
  const user = await getCurrentUser();
  if (!user) return null;

  const assessoria = await prisma.assessoria.findFirst({
    where: { id, officeId: user.officeId },
    include: {
      client: true,
      responsible: true,
      // `parecer` vem junto para as telas que listam documento a documento (aba "Documentos" do
      // site e a seção Documentos do app) conseguirem dizer a QUE PASTA cada arquivo pertence.
      // Sem isso, um documento dentro de um parecer aparece nessas telas idêntico a um documento
      // solto — o mesmo arquivo tem organização numa aba e nenhuma na outra, e a pessoa não tem
      // como saber que existe uma pasta reunindo aquilo.
      documents: {
        orderBy: { date: "desc" },
        include: { uploadedBy: true, case: true, parecer: { select: { id: true, name: true } } },
      },
      // Pareceres (pastas de documentos, ver model Parecer) desta assessoria, com os documentos
      // de dentro de cada um — usado pela aba "Pareceres, Processos e Casos"
      // (AssessoriaProcessosCasosTab.tsx). Documentos PARECER antigos, ainda sem pasta
      // (parecerId nulo), continuam em `documents` acima e são tratados à parte na tela.
      pareceres: {
        orderBy: { date: "desc" },
        include: { documents: { orderBy: { date: "desc" } } },
      },
      honorarios: { orderBy: { competencia: "desc" }, include: { receivable: true } },
      licitacoes: { orderBy: { createdAt: "desc" }, include: { tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } } } },
      // Histórico do botão "Enviar E-mail/WhatsApp" (aba "Pareceres, Processos e Casos") — mesmo
      // padrão de app/(app)/processos/[id]/page.tsx para o Processo. Ver model DocumentoEnvio.
      documentoEnvios: {
        orderBy: { enviadoEm: "desc" },
        include: {
          enviadoPor: { select: { name: true } },
          itens: true,
        },
      },
    },
  });
  if (!assessoria) return null;

  // "Vinculado" tem duas origens: vínculo explícito (assessoriaId, escolhido no cadastro do
  // processo) ou o mesmo cliente da assessoria (comportamento legado, filtro por clientId).
  const linkedCases = await prisma.case.findMany({
    where: { officeId: user.officeId, OR: [{ assessoriaId: id }, { clientId: assessoria.clientId }] },
    orderBy: { updatedAt: "desc" },
  });

  const linkedAttendances = await prisma.attendance.findMany({
    where: { assessoriaId: id, officeId: user.officeId },
    orderBy: { createdAt: "desc" },
  });

  return { ...assessoria, linkedCases, linkedAttendances };
}

// Vincula (ou desvincula, se assessoriaId for null) um Processo/Caso já existente a uma
// Assessoria — usado tanto pelo botão "Vincular processo existente" na aba de Processos e
// Casos da Assessoria quanto pelo seletor de assessoria na própria página do Processo.
export async function setCaseAssessoria(caseId: string, assessoriaId: string | null): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const before = await prisma.case.findFirst({ where: { id: caseId, officeId: user.officeId }, select: { assessoriaId: true } });
  if (!before) return { error: "Processo não encontrado." };

  if (assessoriaId) {
    const target = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId } });
    if (!target) return { error: "Assessoria não encontrada." };
  }

  await prisma.case.update({ where: { id: caseId }, data: { assessoriaId: assessoriaId || null } });

  revalidatePath(`/processos/${caseId}`);
  revalidatePath("/processos");
  if (before.assessoriaId) revalidatePath(`/assessoria/${before.assessoriaId}`);
  if (assessoriaId) revalidatePath(`/assessoria/${assessoriaId}`);
  return {};
}

export async function addDocumento(
  assessoriaId: string,
  data: { name: string; docType: string; driveUrl: string; date?: string; caseId?: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!data.name.trim() || !data.driveUrl.trim()) return { error: "Preencha o nome e o link do Google Drive." };

  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId } });
  if (!assessoria) return { error: "Assessoria não encontrada." };

  if (data.caseId && !(await isCaseInOffice(data.caseId, user.officeId))) {
    return { error: "Processo não encontrado." };
  }

  await prisma.assessoriaDocumento.create({
    data: {
      officeId: assessoria.officeId,
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

// ============ PARECERES (pastas de documentos — ver model Parecer) ============
//
// Um Parecer é um agrupador: nasce com nome/data/descrição e pasta própria no armazenamento
// (Drive/OneDrive/Dropbox), e os documentos entram nele um a um depois, cada um com sua própria
// categoria (ver app/api/assessoria/documentos/upload/route.ts, que aceita parecerId). Substitui
// o comportamento antigo de addDocumento com docType="PARECER" (um arquivo = um parecer) — esse
// caminho continua existindo e intacto para as demais categorias.

// Cria a pasta do Parecer (nome + data + descrição) e, best-effort, já a pasta correspondente no
// armazenamento — mesmo padrão de createAssessoria: se o provedor não estiver conectado ou a
// chamada falhar, o Parecer é criado normalmente mesmo assim (getOrCreateParecerFolder é chamado
// de novo, com o mesmo resultado idempotente, no primeiro upload de documento).
export async function createParecer(
  assessoriaId: string,
  data: { name: string; date?: string; description?: string }
): Promise<{ error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!data.name.trim()) return { error: "Preencha o nome do parecer." };

  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId }, include: { client: true } });
  if (!assessoria) return { error: "Assessoria não encontrada." };

  const created = await prisma.parecer.create({
    data: {
      officeId: user.officeId,
      assessoriaId,
      name: data.name.trim(),
      date: data.date ? new Date(data.date) : new Date(),
      description: data.description?.trim() || null,
      createdById: user.id,
    },
  });

  try {
    await getOrCreateParecerFolder(created.id, assessoria.client.name, created.name, user.officeId);
  } catch {
    // Sem Drive conectado (ou falha pontual) — a pasta é criada/retomada no primeiro upload.
  }

  revalidatePath(`/assessoria/${assessoriaId}`);
  return { id: created.id };
}

export async function updateParecer(
  id: string,
  data: { name?: string; date?: string; description?: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const existing = await prisma.parecer.findFirst({ where: { id, officeId: user.officeId } });
  if (!existing) return { error: "Parecer não encontrado." };
  if (data.name !== undefined && !data.name.trim()) return { error: "Preencha o nome do parecer." };

  await prisma.parecer.update({
    where: { id },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      date: data.date ? new Date(data.date) : undefined,
      description: data.description !== undefined ? data.description.trim() || null : undefined,
    },
  });
  revalidatePath(`/assessoria/${existing.assessoriaId}`);
  return {};
}

// Só permite excluir um Parecer vazio — apagar a pasta inteira com documentos dentro apagaria
// referências que podem estar em envios (DocumentoEnvioItem.assessoriaDocumentoId) e arriscaria
// levar arquivo de verdade do Drive/OneDrive/Dropbox junto sem confirmação explícita por
// documento (mesmo cuidado que deleteAttachment tem, ver lib/actions/attachments.ts). Não apaga a
// pasta no armazenamento — fica vazia lá, sem custo, até alguém reaproveitar ou apagar à mão.
export async function deleteParecer(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const existing = await prisma.parecer.findFirst({
    where: { id, officeId: user.officeId },
    include: { _count: { select: { documents: true } } },
  });
  if (!existing) return { error: "Parecer não encontrado." };
  if (existing._count.documents > 0) {
    return { error: "Este parecer tem documentos dentro — remova ou mova os documentos antes de excluir a pasta." };
  }

  await prisma.parecer.delete({ where: { id } });
  revalidatePath(`/assessoria/${existing.assessoriaId}`);
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

  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId } });
  if (!assessoria) return { error: "Assessoria não encontrada." };

  await prisma.licitacao.create({
    data: {
      officeId: assessoria.officeId,
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
  const existing = await prisma.licitacao.findFirst({ where: { id: licitacaoId, officeId: user.officeId } });
  if (!existing) return { error: "Licitação não encontrada." };
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

  const licitacao = await prisma.licitacao.findFirst({ where: { id: licitacaoId, officeId: user.officeId } });
  if (!licitacao) return { error: "Licitação não encontrada." };

  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, user.officeId))) {
    return { error: "Responsável não encontrado." };
  }

  await prisma.task.create({
    data: {
      officeId: licitacao.officeId,
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
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const honorario = await prisma.honorario.findFirst({ where: { id: honorarioId, officeId: user.officeId } });
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
        officeId: a.officeId,
        description: `Honorário de assessoria — ${a.client.name} — ${monthLabel}`,
        amount: a.monthlyFee,
        dueDate,
        kind: "HONORARIOS_CONTRATUAIS",
        clientId: a.clientId,
      },
    });
    await prisma.honorario.create({ data: { officeId: a.officeId, assessoriaId: a.id, competencia, receivableId: receivable.id } });
    created++;
  }

  revalidatePath("/assessoria");
  return { created };
}
