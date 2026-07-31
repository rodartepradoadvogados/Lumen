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
import { formatLoteFolderName, formatLoteFolderNameProtocolado, formatShortcutName, isProtocoloEditavel } from "@/lib/protocolos";

// Server actions da aba Protocolos do Processo (ver lib/protocolos.ts para a rotina padrão de
// nomes/ciclo de vida, e prisma/schema.prisma para ProtocoloLote/ProtocoloLoteItem).
//
// A regra que atravessa todo este arquivo: um protocolo só REFERENCIA documentos (attachmentId +,
// no Drive, um atalho por targetId) — nenhuma função aqui faz upload nem copia arquivo nenhum.

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
