"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getOrCreateAssessoriaCompanyFolder, getOrCreateParecerFolder, deleteDriveFile, type StorageProvider } from "@/lib/storageProvider";
import { extractDriveFileId, deleteDriveFile as deleteGoogleDriveFile } from "@/lib/googleDrive";
import { syncReceivableStatus } from "@/lib/actions/financeiro";
import { valorLiquido } from "@/lib/financeCalc";
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

type CreateAssessoriaInput = {
  clientId: string;
  monthlyFee: string;
  dueDay: string;
  responsibleId?: string;
};

async function buildAssessoria(data: CreateAssessoriaInput): Promise<{ error?: string; id?: string }> {
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
  // catálogo de Documentos só usa link colado, não depende da pasta existir). ANTES este catch
  // engolia o erro em silêncio (nem log, nem aviso) — a pasta "aparecia criada" com o campo vazio
  // no banco e ninguém sabia por quê. Agora o erro fica registrado (console.error, para aparecer
  // nos logs da Vercel) e a tela da Assessoria (app/(app)/assessoria/[id]/page.tsx) mostra um
  // aviso com "Tentar criar pasta de novo" (ver retryAssessoriaDriveFolder) sempre que
  // driveFolderId ficar nulo com o Drive conectado.
  let driveFolderId: string | null = null;
  try {
    driveFolderId = await getOrCreateAssessoriaCompanyFolder(client.name, user.officeId);
  } catch (err) {
    console.error(`[assessoria] falha ao criar pasta no Drive para "${client.name}" (office ${user.officeId}):`, err);
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
  return { id: created.id };
}

export async function createAssessoria(data: CreateAssessoriaInput): Promise<{ error?: string }> {
  const result = await buildAssessoria(data);
  if (result.error) return { error: result.error };
  redirect(`/assessoria/${result.id}`);
}

// Mesmo cadastro de createAssessoria, mas sem redirect() — o redirect da versão desktop aponta
// pra "/assessoria/{id}" (fora de /m), então o app mobile precisa navegar ele mesmo, pro
// equivalente "/m/assessoria/{id}" (mesmo padrão de createCaseMobile em lib/actions/cases.ts,
// ver components/mobile/MobileNewAssessoriaForm.tsx).
export async function createAssessoriaMobile(data: CreateAssessoriaInput): Promise<{ error?: string; id?: string }> {
  return buildAssessoria(data);
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
      // where filtra os tombstones (receivableId null, ver comentário do model Honorario em
      // prisma/schema.prisma) — mensalidade cancelada pelo usuário some da lista como se nunca
      // tivesse existido; o registro continua no banco só para travar o cron.
      honorarios: { where: { receivableId: { not: null } }, orderBy: { competencia: "desc" }, include: { receivable: true } },
      // Despesas recorrentes mensais vinculadas (repasse a parceiro) — ver comentário em
      // RecurringExpense.assessoriaId, prisma/schema.prisma. Mostradas lado a lado com
      // `honorarios` acima na aba Honorários (AssessoriaHonorariosTab.tsx).
      recurringExpenses: { where: { active: true }, orderBy: { createdAt: "asc" } },
      licitacoes: {
        orderBy: { createdAt: "desc" },
        include: {
          tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } },
          attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
          comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
          // Histórico do botão "Enviar E-mail/WhatsApp" desta licitação — mesmo padrão do
          // `documentoEnvios` da Assessoria logo abaixo, só que escopado por licitacaoId.
          documentoEnvios: {
            orderBy: { enviadoEm: "desc" },
            include: {
              enviadoPor: { select: { name: true } },
              itens: true,
            },
          },
        },
      },
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

  return {
    ...assessoria,
    // O `where: { receivableId: { not: null } }` do include acima já garante isto em runtime —
    // Receivable é opcional no schema (tombstone de mensalidade cancelada, ver model Honorario),
    // então o Prisma tipa como nullable mesmo filtrado; esta asserção fecha só esse gap de tipo
    // para as telas que consomem `h.receivable.*` sem checagem extra (nunca veem um tombstone).
    honorarios: assessoria.honorarios.map((h) => ({ ...h, receivable: h.receivable! })),
    linkedCases,
    linkedAttendances,
  };
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

// Exclui um documento (solto ou dentro de uma demanda/Parecer) — mesmo padrão de deleteAttachment
// em lib/actions/attachments.ts: apaga o arquivo de verdade no provedor certo (best-effort — se
// falhar lá, segue removendo o vínculo mesmo assim, pra não travar quem está apagando por um
// arquivo já removido manualmente) e só depois o registro. Documentos antigos (pré-migração de
// storageFileId, só com driveUrl) caem no fallback de extrair o id pela URL do Google Drive.
export async function deleteDocumento(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const doc = await prisma.assessoriaDocumento.findFirst({ where: { id, officeId: user.officeId } });
  if (!doc) return { error: "Documento não encontrado." };

  if (doc.storageFileId) {
    const provider: StorageProvider =
      doc.storageProvider === "ONEDRIVE" ? "ONEDRIVE" : doc.storageProvider === "DROPBOX" ? "DROPBOX" : "GOOGLE_DRIVE";
    await deleteDriveFile(doc.storageFileId, user.officeId, provider).catch(() => {});
  } else {
    const fileId = extractDriveFileId(doc.driveUrl);
    if (fileId) {
      await deleteGoogleDriveFile(fileId, user.officeId).catch(() => {});
    }
  }

  await prisma.assessoriaDocumento.delete({ where: { id } });
  revalidatePath(`/assessoria/${doc.assessoriaId}`);
  return {};
}

// Renomeia/recategoriza um documento — cobre tanto um documento solto na aba "Documentos" quanto
// um "parecer solto" legado (docType="PARECER" sem parecerId, ver pareceresSoltos em
// AssessoriaProcessosCasosTab.tsx): antes do backfill (scripts/backfill-pareceres.ts) rodar em
// produção, essas demandas antigas não viram uma pasta de verdade, então não passam pelo "Editar"
// de ParecerFolderRow — esta ação dá a elas o mesmo direito de renomear.
export async function updateDocumento(
  id: string,
  data: { name?: string; docType?: string; date?: string }
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const doc = await prisma.assessoriaDocumento.findFirst({ where: { id, officeId: user.officeId } });
  if (!doc) return { error: "Documento não encontrado." };
  if (data.name !== undefined && !data.name.trim()) return { error: "Preencha o nome do documento." };

  await prisma.assessoriaDocumento.update({
    where: { id },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      docType: data.docType,
      date: data.date ? new Date(data.date) : undefined,
    },
  });
  revalidatePath(`/assessoria/${doc.assessoriaId}`);
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
  } catch (err) {
    // Sem Drive conectado (ou falha pontual): a pasta é RETOMADA no primeiro upload de documento
    // (getOrCreateParecerFolder é chamado de novo, com o mesmo resultado idempotente, em
    // app/api/assessoria/documentos/upload/route.ts) — então isto nunca bloqueia o cadastro. Mas
    // o erro não pode mais sumir em silêncio: registrado aqui, e a linha desta demanda em
    // AssessoriaProcessosCasosTab.tsx mostra "Tentar criar pasta de novo" (ver
    // retryParecerDriveFolder) enquanto driveFolderId continuar nulo.
    console.error(`[assessoria] falha ao criar pasta de parecer "${created.name}" (assessoria ${assessoriaId}):`, err);
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

// Repete a criação da pasta da EMPRESA no Drive/OneDrive/Dropbox — botão "Tentar criar pasta de
// novo" na tela da Assessoria (app/(app)/assessoria/[id]/page.tsx), visível quando
// Assessoria.driveFolderId está nulo (falha silenciosa antiga em createAssessoria, agora com erro
// registrado e recuperável em vez de só logado). getOrCreateAssessoriaCompanyFolder é a mesma
// função chamada na criação — idempotente, então repetir não duplica nada no armazenamento.
export async function retryAssessoriaDriveFolder(assessoriaId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId }, include: { client: true } });
  if (!assessoria) return { error: "Assessoria não encontrada." };
  if (assessoria.driveFolderId) return {}; // já tem pasta — nada a fazer

  try {
    const driveFolderId = await getOrCreateAssessoriaCompanyFolder(assessoria.client.name, user.officeId);
    await prisma.assessoria.update({ where: { id: assessoriaId }, data: { driveFolderId } });
  } catch (err) {
    console.error(`[assessoria] retry de pasta no Drive falhou para "${assessoria.client.name}" (office ${user.officeId}):`, err);
    return { error: "Não foi possível criar a pasta agora. Verifique se o armazenamento em nuvem está conectado (Configurações) e tente de novo." };
  }

  revalidatePath(`/assessoria/${assessoriaId}`);
  return {};
}

// Mesma ideia, para a pasta de um Parecer (demanda) específico — botão "Tentar criar pasta de
// novo" em cada linha de AssessoriaProcessosCasosTab.tsx quando Parecer.driveFolderId está nulo.
export async function retryParecerDriveFolder(parecerId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const parecer = await prisma.parecer.findFirst({
    where: { id: parecerId, officeId: user.officeId },
    include: { assessoria: { include: { client: true } } },
  });
  if (!parecer) return { error: "Demanda não encontrada." };
  if (parecer.driveFolderId) return {};

  try {
    await getOrCreateParecerFolder(parecer.id, parecer.assessoria.client.name, parecer.name, user.officeId);
  } catch (err) {
    console.error(`[assessoria] retry de pasta de parecer "${parecer.name}" (assessoria ${parecer.assessoriaId}) falhou:`, err);
    return { error: "Não foi possível criar a pasta agora. Verifique se o armazenamento em nuvem está conectado (Configurações) e tente de novo." };
  }

  revalidatePath(`/assessoria/${parecer.assessoriaId}`);
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

// Dá baixa direto (FinancePayment + syncReceivableStatus), sem passar por markReceivablePaid/
// requireFinanceOfficeId — decisão do dono (achado A06 da revisão gauntlet): honorário de
// assessoria é dinheiro do módulo Assessoria, não do Financeiro, e um escritório com Assessoria
// ativa mas sem Financeiro contratado precisa continuar conseguindo baixar a própria mensalidade.
// Mesma checagem de acesso das demais Server Actions deste arquivo (sessão + officeId — o gate de
// moduloAssessoria já vive no layout da rota, não repetido tela a tela aqui).
// SEGURANÇA (achado V1, auditoria de 05/09/2026 — corrida de pagamento duplicado): mesmo lock de
// linha de markPayablePaid/markReceivablePaid (lib/actions/financeiro.ts) — sem ele, duas
// chamadas concorrentes (duplo clique, duas abas) liam o mesmo saldo antes de qualquer uma
// escrever e criavam dois FinancePayment para a mesma mensalidade.
export async function markHonorarioPaid(honorarioId: string, paidAmount: number, paidDate: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const honorario = await prisma.honorario.findFirst({ where: { id: honorarioId, officeId: user.officeId } });
  if (!honorario) return { error: "Honorário não encontrado." };
  // Tombstone de mensalidade cancelada (receivableId null, ver model Honorario) — não deveria
  // ser alcançável pela UI (getAssessoriaDetail já filtra), mas defende contra chamada direta.
  if (!honorario.receivableId) return { error: "Esta mensalidade foi cancelada." };
  const receivableId = honorario.receivableId;

  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Receivable" WHERE id = ${receivableId} AND "officeId" = ${user.officeId} FOR UPDATE`;
      if (locked.length === 0) throw new Error("Conta a receber não encontrada.");
      const receivable = await tx.receivable.findFirstOrThrow({ where: { id: receivableId, officeId: user.officeId }, select: { amount: true, discount: true, surcharge: true } });
      const pagos = await tx.financePayment.aggregate({ where: { receivableId }, _sum: { amount: true } });
      const soma = pagos._sum.amount ?? 0;
      const saldo = valorLiquido(receivable.amount, receivable.discount, receivable.surcharge) - soma;
      if (saldo <= 0.005) throw new Error("Esta mensalidade já foi quitada (baixa duplicada recusada).");
      if (paidAmount > saldo + 0.005) throw new Error(`Valor informado (${paidAmount.toFixed(2)}) é maior que o saldo em aberto (${saldo.toFixed(2)}).`);

      await tx.financePayment.create({
        data: { officeId: user.officeId, amount: paidAmount, paidDate: new Date(paidDate), receivableId },
      });
      await syncReceivableStatus(receivableId, user.officeId, tx);
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao confirmar a baixa." };
  }

  // Mesma lista de revalidatePath de revalidateFinance() em lib/actions/financeiro.ts — não
  // importável direto (não é async, "use server" só permite exportar async), então repetida
  // aqui como lib/actions/honorarioLancamento.ts já faz.
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/receitas");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  revalidatePath(`/assessoria/${honorario.assessoriaId}`);
  return {};
}

// Chamado pelo cron mensal (app/api/cron/assessoria-honorarios/route.ts). Gera, para cada
// assessoria ativa, o Honorario + Receivable do mês corrente, se ainda não existir — nunca
// duplica (protegido pela constraint única assessoriaId+competencia).
export async function generateAllMonthlyHonorarios(): Promise<{ created: number; failed: number }> {
  const now = new Date();
  const competencia = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const assessorias = await prisma.assessoria.findMany({ where: { status: "ATIVA" }, include: { client: true } });

  let created = 0;
  let failed = 0;
  for (const a of assessorias) {
    try {
      const exists = await prisma.honorario.findUnique({
        where: { assessoriaId_competencia: { assessoriaId: a.id, competencia } },
      });
      if (exists) continue;

      const dueDate = new Date(now.getFullYear(), now.getMonth(), a.dueDay);
      const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

      // $transaction: Receivable e Honorario nascem juntos ou não nascem — antes eram duas
      // escritas independentes com a idempotência ancorada só no Honorario (findUnique acima).
      // Se a segunda escrita falhasse (queda de conexão, timeout), o Receivable ficava gravado
      // e órfão; como a guarda só olha Honorario, a execução seguinte não via nada e criava um
      // SEGUNDO Receivable para a mesma assessoria/competência — cobrança duplicada em Contas a
      // Receber, DRE e fluxo de caixa (achado A74 da revisão gauntlet).
      await prisma.$transaction(async (tx) => {
        const receivable = await tx.receivable.create({
          data: {
            officeId: a.officeId,
            description: `Honorário de assessoria — ${a.client.name} — ${monthLabel}`,
            amount: a.monthlyFee,
            dueDate,
            kind: "HONORARIOS_CONTRATUAIS",
            clientId: a.clientId,
          },
        });
        await tx.honorario.create({ data: { officeId: a.officeId, assessoriaId: a.id, competencia, receivableId: receivable.id } });
      });
      created++;
    } catch (e) {
      // try/catch por item (mesmo padrão de lib/driveSync.ts e de
      // ensureRecurringFeeReceivables/ensureRecurringExpensePayables em lib/actions/
      // financeiro.ts) — uma assessoria com dado ruim não pode travar a geração de todas as
      // outras que vêm depois dela na lista (achado A75).
      failed++;
      console.error(`[assessoria-honorarios] falha ao gerar honorário da assessoria ${a.id} (escritório ${a.officeId}):`, e);
    }
  }

  revalidatePath("/assessoria");
  return { created, failed };
}
