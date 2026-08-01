"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice } from "@/lib/officeScope";
import { getStorageProvider, getOrCreateCaseFolder } from "@/lib/storageProvider";
import {
  getOrCreateProtocolosContainerFolder,
  createNamedDriveFolder,
  createDriveShortcut,
  deleteDriveFile,
  renameDriveFolder,
  extractDriveFileId,
} from "@/lib/googleDrive";
import {
  formatLoteFolderName,
  formatLoteFolderNameProtocolado,
  formatShortcutName,
  isProtocoloEditavel,
  sugerirDocumentos,
  procuracaoFaltandoErro,
  DOC_TYPE_PROCURACAO,
} from "@/lib/protocolos";

// Server actions da aba Protocolos do Processo (ver lib/protocolos.ts para a rotina padrão de
// nomes/ciclo de vida, e prisma/schema.prisma para ProtocoloLote/ProtocoloLoteItem).
//
// A regra que atravessa todo este arquivo: um protocolo só REFERENCIA documentos (attachmentId +,
// no Drive, um atalho por targetId) — nenhuma função aqui faz upload nem copia arquivo nenhum.

// Checa se o processo tem ao menos um anexo do tipo Procuração — pré-requisito para marcar um
// lote como pronto/protocolado (ver procuracaoFaltandoErro em lib/protocolos.ts). Não olha
// status/validade nenhuma (o sistema não guarda isso hoje): só "existe algum anexo desse tipo",
// o mesmo nível de rigor que qualquer outra checagem de anexo por docType no projeto.
async function caseTemProcuracao(caseId: string, officeId: string): Promise<boolean> {
  const count = await prisma.attachment.count({ where: { caseId, officeId, docType: DOC_TYPE_PROCURACAO } });
  return count > 0;
}

// Cria o protocolo e já tenta gerar a pasta-espelho no Drive. Falha na parte do Drive não derruba
// o protocolo: ele fica registrado no site (fonte da verdade) mesmo sem pasta — devolvido em
// `driveError` pra tela avisar sem bloquear o fluxo. "Gerar pasta no Drive" (gerarPastaDoLote)
// permite tentar de novo depois.
export async function createProtocoloLote(data: {
  caseId: string;
  titulo: string;
  attachmentIds: string[];
}): Promise<{ id?: string; error?: string; driveError?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!data.titulo.trim()) return { error: "Dê um título ao protocolo." };
  if (data.attachmentIds.length === 0) return { error: "Selecione ao menos um documento." };
  if (!(await isCaseInOffice(data.caseId, viewer.officeId))) return { error: "Processo não encontrado." };

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: data.attachmentIds }, officeId: viewer.officeId, caseId: data.caseId },
    select: { id: true, name: true, docType: true },
  });
  // Garante que todo id pedido realmente pertence a este processo/escritório — o que não resolver
  // (de outro processo, excluído entre a seleção e o clique etc.) é ignorado, não barra o resto.
  // A ordem final segue a ordem em que os ids chegaram em attachmentIds.
  const byId = new Map(attachments.map((a) => [a.id, a]));
  const ordered = data.attachmentIds.map((id) => byId.get(id)).filter((a): a is (typeof attachments)[number] => Boolean(a));
  if (ordered.length === 0) return { error: "Nenhum dos documentos selecionados foi encontrado." };

  const lote = await prisma.protocoloLote.create({
    data: {
      titulo: data.titulo.trim(),
      caseId: data.caseId,
      officeId: viewer.officeId,
      criadoPorId: viewer.id,
      itens: {
        create: ordered.map((a, idx) => ({
          ordem: idx + 1,
          attachmentId: a.id,
          nomeSnapshot: a.name,
          docTypeSnapshot: a.docType,
        })),
      },
    },
  });

  revalidatePath(`/processos/${data.caseId}`);

  const driveResult = await gerarPastaDoLote(lote.id);
  return { id: lote.id, driveError: driveResult.error };
}

// Substitui a lista de documentos por completo (seleção + ordem) — só permitido enquanto o
// protocolo ainda não foi concluído (ver isProtocoloEditavel). Se já existia pasta no Drive,
// regenera ela do zero (mais simples e mais seguro que diffar atalho a atalho; lotes têm poucos
// itens, então o custo de recriar tudo é desprezível).
export async function updateProtocoloLoteItens(data: {
  loteId: string;
  attachmentIds: string[];
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (data.attachmentIds.length === 0) return { error: "Selecione ao menos um documento." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: data.loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };
  if (!isProtocoloEditavel(lote.status)) return { error: "Este protocolo já foi concluído ou cancelado — não pode mais ser editado." };

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: data.attachmentIds }, officeId: viewer.officeId, caseId: lote.caseId },
    select: { id: true, name: true, docType: true },
  });
  const byId = new Map(attachments.map((a) => [a.id, a]));
  const ordered = data.attachmentIds.map((id) => byId.get(id)).filter((a): a is (typeof attachments)[number] => Boolean(a));
  if (ordered.length === 0) return { error: "Nenhum dos documentos selecionados foi encontrado." };

  await prisma.$transaction([
    prisma.protocoloLoteItem.deleteMany({ where: { loteId: data.loteId } }),
    prisma.protocoloLoteItem.createMany({
      data: ordered.map((a, idx) => ({
        loteId: data.loteId,
        ordem: idx + 1,
        attachmentId: a.id,
        nomeSnapshot: a.name,
        docTypeSnapshot: a.docType,
      })),
    }),
  ]);

  revalidatePath(`/processos/${lote.caseId}`);

  if (lote.driveFolderId) {
    const driveResult = await gerarPastaDoLote(data.loteId);
    return { error: driveResult.error };
  }
  return {};
}

// Cria (ou recria do zero, se já existia) a pasta do lote no Drive com um atalho por documento,
// na ordem definida. Só roda quando o escritório usa Google Drive (ver getStorageProvider) — nos
// outros dois provedores o lote funciona igual no site, só sem essa pasta espelho, sem perder
// nenhuma funcionalidade (o site é a fonte da verdade, a pasta é conveniência).
export async function gerarPastaDoLote(loteId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const lote = await prisma.protocoloLote.findFirst({
    where: { id: loteId, officeId: viewer.officeId },
    include: { itens: { orderBy: { ordem: "asc" } }, case: { select: { id: true, title: true } } },
  });
  if (!lote) return { error: "Protocolo não encontrado." };
  if (!isProtocoloEditavel(lote.status)) return { error: "Este protocolo já foi concluído ou cancelado." };

  const provider = await getStorageProvider(viewer.officeId);
  if (provider !== "GOOGLE_DRIVE") {
    return { error: "Pasta-espelho no Drive disponível só para escritórios com Google Drive conectado. O protocolo continua funcionando normalmente aqui no site." };
  }

  try {
    const caseFolderId = await getOrCreateCaseFolder(lote.caseId, lote.case.title, viewer.officeId);
    const protocolosFolderId = await getOrCreateProtocolosContainerFolder(caseFolderId, viewer.officeId);

    if (lote.driveFolderId) {
      await deleteDriveFile(lote.driveFolderId, viewer.officeId).catch(() => {});
    }
    const loteFolderId = await createNamedDriveFolder(protocolosFolderId, formatLoteFolderName(lote.createdAt, lote.titulo), viewer.officeId);

    for (const item of lote.itens) {
      if (!item.attachmentId) continue; // item já perdeu o anexo original (ver deleteAttachment) — nada pra apontar

      const attachment = await prisma.attachment.findFirst({
        where: { id: item.attachmentId },
        select: { driveUrl: true, storageFileId: true, storageProvider: true },
      });
      if (!attachment || attachment.storageProvider !== "GOOGLE_DRIVE") continue; // atalho não existe entre provedores diferentes

      // Anexos de antes do campo storageFileId existir não têm o id gravado direto — mesmo
      // fallback usado por deleteAttachment (lib/actions/attachments.ts): extrai da URL do Drive.
      const targetId = attachment.storageFileId || extractDriveFileId(attachment.driveUrl);
      if (!targetId) continue;

      const shortcutId = await createDriveShortcut(loteFolderId, formatShortcutName(item.ordem, item.nomeSnapshot), targetId, viewer.officeId);
      await prisma.protocoloLoteItem.update({ where: { id: item.id }, data: { driveShortcutId: shortcutId } });
    }

    await prisma.protocoloLote.update({ where: { id: loteId }, data: { driveFolderId: loteFolderId } });
    revalidatePath(`/processos/${lote.caseId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao gerar a pasta no Drive." };
  }
}

// Marca o protocolo como concluído: número, data, quem registrou e (opcional) o comprovante — o
// único arquivo novo que um protocolo cria, já como Attachment comum (docType
// COMPROVANTE_PROTOCOLO), enviado antes pelo fluxo normal de anexos. A partir daqui o lote é
// registro histórico: isProtocoloEditavel passa a valer false pra ele.
export async function registrarProtocolo(data: {
  loteId: string;
  numeroProtocolo: string;
  protocoladoEm: string; // yyyy-mm-dd, de um <input type="date">
  comprovanteAttachmentId?: string;
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!data.numeroProtocolo.trim()) return { error: "Informe o número do protocolo." };
  if (!data.protocoladoEm) return { error: "Informe a data do protocolo." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: data.loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };
  if (!isProtocoloEditavel(lote.status)) return { error: "Este protocolo já foi concluído ou cancelado." };

  // Bloqueia (não só avisa, ver lib/protocolos.ts) mesmo que o lote já esteja PRONTO — a
  // procuração pode ter sido excluída DEPOIS de marcarProtocoloPronto, e concluir um protocolo
  // sem ela é sério o bastante para checar de novo aqui, na porta de saída.
  if (!(await caseTemProcuracao(lote.caseId, viewer.officeId))) return { error: procuracaoFaltandoErro() };

  if (data.comprovanteAttachmentId) {
    const comprovante = await prisma.attachment.findFirst({
      where: { id: data.comprovanteAttachmentId, officeId: viewer.officeId, caseId: lote.caseId },
      select: { id: true },
    });
    if (!comprovante) return { error: "Comprovante não encontrado." };
  }

  // Data-calendário em meia-noite UTC — mesma convenção de Task.dueDate (ver
  // formatCalendarDate em components/ui.tsx): é "o dia", não um instante.
  const protocoladoEm = new Date(`${data.protocoladoEm}T00:00:00Z`);

  await prisma.protocoloLote.update({
    where: { id: data.loteId },
    data: {
      status: "PROTOCOLADO",
      numeroProtocolo: data.numeroProtocolo.trim(),
      protocoladoEm,
      protocoladoPorId: viewer.id,
      comprovanteId: data.comprovanteAttachmentId || null,
    },
  });

  // Não checa o provedor ATUAL do escritório aqui de propósito: se driveFolderId existe, essa
  // pasta só pode ter sido criada enquanto o provedor era Google (gerarPastaDoLote já garante
  // isso) — continua válida renomear mesmo que o escritório tenha trocado de provedor depois.
  if (lote.driveFolderId) {
    await renameDriveFolder(
      lote.driveFolderId,
      formatLoteFolderNameProtocolado(lote.createdAt, lote.titulo, data.numeroProtocolo.trim()),
      viewer.officeId
    ).catch(() => {});
  }

  revalidatePath(`/processos/${lote.caseId}`);
  return {};
}

// Desiste de um protocolo antes de concluí-lo. Apaga a pasta inteira do Drive num só golpe —
// segura porque ela só contém atalhos (ver lib/protocolos.ts): nunca toca nos documentos
// originais, mesmo com o cancelamento acontecendo por engano. O registro do lote permanece,
// marcado CANCELADO, pra manter o histórico de que ele existiu.
export async function cancelarProtocoloLote(loteId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };
  if (lote.status === "PROTOCOLADO") {
    return { error: "Um protocolo já concluído não pode ser cancelado — ele é registro do que foi enviado ao tribunal." };
  }
  if (lote.status === "CANCELADO") return {};

  if (lote.driveFolderId) {
    await deleteDriveFile(lote.driveFolderId, viewer.officeId).catch(() => {});
  }

  await prisma.protocoloLote.update({ where: { id: loteId }, data: { status: "CANCELADO", driveFolderId: null } });
  revalidatePath(`/processos/${lote.caseId}`);
  return {};
}

// Marca o lote como PRONTO (pronto para envio, ainda não protocolado) — passo opcional entre
// "Em preparo" e "Registrar protocolo". Mesma trava de procuração que registrarProtocolo, aqui na
// porta de entrada: se falta procuração, é aqui que a pessoa vai esbarrar primeiro na maioria das
// vezes (registrar só acontece depois, já com o protocolo na mão do tribunal).
export async function marcarProtocoloPronto(loteId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };
  if (!isProtocoloEditavel(lote.status)) return { error: "Este protocolo já foi concluído ou cancelado." };
  if (lote.status === "PRONTO") return {};

  if (!(await caseTemProcuracao(lote.caseId, viewer.officeId))) return { error: procuracaoFaltandoErro() };

  await prisma.protocoloLote.update({ where: { id: loteId }, data: { status: "PRONTO" } });
  revalidatePath(`/processos/${lote.caseId}`);
  return {};
}

// Volta um lote PRONTO para EM_PREPARO — para quando marcar como pronto foi engano, ou a lista de
// documentos precisa mudar de novo (updateProtocoloLoteItens não trava por status ser PRONTO, mas
// faz sentido dar um jeito explícito de "destravar" o status também).
export async function reabrirProtocoloLote(loteId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };
  if (lote.status !== "PRONTO") return { error: "Só um protocolo marcado como pronto pode voltar para em preparo." };

  await prisma.protocoloLote.update({ where: { id: loteId }, data: { status: "EM_PREPARO" } });
  revalidatePath(`/processos/${lote.caseId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Sugestão de documentos (ver sugerirDocumentos em lib/protocolos.ts para a heurística)
// ---------------------------------------------------------------------------

export async function sugerirDocumentosProtocolo(caseId: string): Promise<{ attachmentIds: string[]; motivo: string; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { attachmentIds: [], motivo: "", error: "Sessão expirada. Faça login novamente." };
  if (!(await isCaseInOffice(caseId, viewer.officeId))) return { attachmentIds: [], motivo: "", error: "Processo não encontrado." };

  const [attachments, itens] = await Promise.all([
    prisma.attachment.findMany({ where: { caseId, officeId: viewer.officeId }, select: { id: true, docType: true } }),
    prisma.protocoloLoteItem.findMany({
      where: { lote: { caseId, officeId: viewer.officeId } },
      select: { attachmentId: true, docTypeSnapshot: true },
    }),
  ]);

  const attachmentIdsJaUsados = itens.map((i) => i.attachmentId).filter((id): id is string => Boolean(id));
  const docTypesHistorico = itens.map((i) => i.docTypeSnapshot);

  const sugestao = sugerirDocumentos(attachments, attachmentIdsJaUsados, docTypesHistorico);
  return sugestao;
}

// ---------------------------------------------------------------------------
// Aviso "já protocolado" (não-bloqueante — ver lib/protocolos.ts)
// ---------------------------------------------------------------------------

export type DocumentoJaProtocolado = { loteTitulo: string; numeroProtocolo: string | null };

// Documentos deste processo que já entraram em algum lote CONCLUÍDO (status PROTOCOLADO) — usado
// pela tela para só avisar, nunca impedir, quando alguém monta um lote novo com um documento que
// já foi enviado ao tribunal antes (situação legítima às vezes: reenvio, novo recurso que
// referencia a mesma procuração etc.). Lotes em preparo/prontos (ainda não enviados de verdade)
// não entram aqui — reaproveitar um documento num lote que ainda nem foi protocolado não é o
// mesmo alerta.
export async function getDocumentosJaProtocolados(caseId: string): Promise<Record<string, DocumentoJaProtocolado>> {
  const viewer = await getCurrentUser();
  if (!viewer) return {};

  const itens = await prisma.protocoloLoteItem.findMany({
    where: { attachmentId: { not: null }, lote: { caseId, officeId: viewer.officeId, status: "PROTOCOLADO" } },
    select: { attachmentId: true, lote: { select: { titulo: true, numeroProtocolo: true } } },
    orderBy: { id: "asc" },
  });

  const map: Record<string, DocumentoJaProtocolado> = {};
  for (const item of itens) {
    if (!item.attachmentId || map[item.attachmentId]) continue; // primeiro protocolo em que apareceu é suficiente pro aviso
    map[item.attachmentId] = { loteTitulo: item.lote.titulo, numeroProtocolo: item.lote.numeroProtocolo };
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tarefa/prazo vinculado ao lote (ProtocoloLote.taskId — ver prisma/schema.prisma)
// ---------------------------------------------------------------------------

export type TarefaVinculada = { id: string; title: string; dueDate: string; status: string };

// Info da tarefa vinculada a cada lote informado (só os que têm taskId preenchido e cuja tarefa
// ainda existe) — em lote único de consulta, pra tela buscar de uma vez pra todos os cards
// visíveis em vez de uma consulta por card.
export async function getVinculoTarefa(loteIds: string[]): Promise<Record<string, TarefaVinculada>> {
  const viewer = await getCurrentUser();
  if (!viewer || loteIds.length === 0) return {};

  const lotes = await prisma.protocoloLote.findMany({
    where: { id: { in: loteIds }, officeId: viewer.officeId, taskId: { not: null } },
    select: { id: true, taskId: true },
  });
  const taskIds = lotes.map((l) => l.taskId).filter((id): id is string => Boolean(id));
  if (taskIds.length === 0) return {};

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds }, officeId: viewer.officeId },
    select: { id: true, title: true, dueDate: true, status: true },
  });
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const result: Record<string, TarefaVinculada> = {};
  for (const lote of lotes) {
    const task = lote.taskId ? taskById.get(lote.taskId) : undefined;
    if (task) result[lote.id] = { id: task.id, title: task.title, dueDate: task.dueDate.toISOString(), status: task.status };
  }
  return result;
}

// Tarefas do processo, para escolher qual vincular a um lote (vincularTaskAoLote) — exclui
// canceladas (não faz sentido vincular um prazo morto a um protocolo ativo) e ordena pela data,
// pra quem está procurando "o prazo tal" achar rápido.
export async function listarTasksDoCaso(caseId: string): Promise<{ id: string; title: string; dueDate: string; status: string }[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  if (!(await isCaseInOffice(caseId, viewer.officeId))) return [];

  const tasks = await prisma.task.findMany({
    where: { caseId, officeId: viewer.officeId, status: { not: "CANCELADO" } },
    select: { id: true, title: true, dueDate: true, status: true },
    orderBy: { dueDate: "asc" },
  });
  return tasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate.toISOString(), status: t.status }));
}

// Vincula uma tarefa JÁ EXISTENTE (do mesmo processo) a um lote.
export async function vincularTaskAoLote(data: { loteId: string; taskId: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: data.loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };

  // A tarefa precisa ser do MESMO processo do lote — vincular um prazo de outro processo
  // confundiria quem olha a Agenda/Kanban depois achando que aquele prazo é sobre este caso.
  const task = await prisma.task.findFirst({ where: { id: data.taskId, officeId: viewer.officeId, caseId: lote.caseId } });
  if (!task) return { error: "Tarefa não encontrada neste processo." };

  await prisma.protocoloLote.update({ where: { id: data.loteId }, data: { taskId: task.id } });
  revalidatePath(`/processos/${lote.caseId}`);
  return {};
}

// Cria uma tarefa nova (tipo PRAZO) já vinculada ao lote — atalho de "preciso protocolar isso até
// tal dia" sem sair da aba Protocolos para a Agenda/Kanban.
export async function criarTarefaDoLote(data: { loteId: string; title: string; dueDate: string }): Promise<{ error?: string; taskId?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!data.title.trim()) return { error: "Dê um título à tarefa." };
  if (!data.dueDate) return { error: "Informe a data do prazo." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: data.loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };

  const firstColumn = await prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" } });
  const typePoints = await prisma.taskTypePoints.findUnique({ where: { officeId_type: { officeId: viewer.officeId, type: "PRAZO" } } });

  // Data-calendário em meia-noite UTC — mesma convenção usada em registrarProtocolo/Task.dueDate
  // (ver formatCalendarDate em components/ui.tsx).
  const task = await prisma.task.create({
    data: {
      title: data.title.trim(),
      type: "PRAZO",
      dueDate: new Date(`${data.dueDate}T00:00:00Z`),
      priority: "ALTA",
      caseId: lote.caseId,
      responsibleId: viewer.id,
      columnId: firstColumn?.id ?? null,
      points: typePoints?.points ?? 10,
      officeId: viewer.officeId,
    },
  });

  await prisma.protocoloLote.update({ where: { id: data.loteId }, data: { taskId: task.id } });
  revalidatePath(`/processos/${lote.caseId}`);
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  return { taskId: task.id };
}

// Desfaz o vínculo (não apaga a tarefa — ela continua existindo normalmente na Agenda/Kanban,
// só deixa de aparecer atrelada a este lote).
export async function desvincularTaskDoLote(loteId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const lote = await prisma.protocoloLote.findFirst({ where: { id: loteId, officeId: viewer.officeId } });
  if (!lote) return { error: "Protocolo não encontrado." };

  await prisma.protocoloLote.update({ where: { id: loteId }, data: { taskId: null } });
  revalidatePath(`/processos/${lote.caseId}`);
  return {};
}
