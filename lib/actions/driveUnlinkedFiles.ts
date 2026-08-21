"use server";

// Detecta arquivos que JÁ ESTÃO no lugar certo do Drive (pasta do processo/atendimento/empresa +
// subpasta de categoria correta) mas ainda não têm Attachment/AssessoriaDocumento no banco — o
// mesmo caso que lib/driveSync.ts já resolve sozinho, todo dia, via cron (ver comentário no topo
// daquele arquivo). Esta ação é o caminho SOB DEMANDA, com confirmação por checkbox (pedido
// separado do dono do produto) — e é DELIBERADAMENTE uma varredura própria, sem reaproveitar nem
// alterar nenhuma função de lib/driveSync.ts: aquele cron já funciona bem sozinho em produção, e
// mexer nele só para acrescentar um modo "simulação" arriscaria essa automação que já está
// rodando (achado A69 da revisão gauntlet documenta o quanto de cuidado de concorrência tem ali
// dentro). Duplicar uma versão mais simples aqui é o preço consciente dessa segurança.
//
// Mais simples também por natureza: aqui é 1 escritório por clique (não todos, sob o orçamento de
// 300s do cron), sequencial, sem o paralelismo cuidadoso que lib/driveSync.ts precisa pra caber no
// tempo — um clique manual pode demorar mais um pouco sem problema nenhum.
//
// Fora do escopo desta tela DE PROPÓSITO (continuam só como DriveSyncIssue, resolvidos pelo cron
// normal): pasta de processo/atendimento/empresa sem correspondência, subpasta de categoria com
// nome desconhecido, arquivo solto fora de qualquer categoria, anexo que sumiu do Drive. Esta
// tela só cobre o caso positivo — arquivo no lugar 100% certo, só faltando o registro no banco.
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import {
  DRIVE_FOLDER_MIME_TYPE,
  hasPrimaryDriveCredential,
  listDriveChildren,
  getProcessosRootFolderId,
  getCasosRootFolderId,
  getAtendimentosRootFolderId,
  getAssessoriaRootFolderId,
  ASSESSORIA_DOC_TYPE_FOLDERS,
} from "@/lib/googleDrive";
import { DOCUMENT_TYPES } from "@/lib/documentTypes";
import { isReservedCaseSubfolder } from "@/lib/protocolos";

function driveFileUrl(id: string, webViewLink?: string | null): string {
  return webViewLink || `https://drive.google.com/file/d/${id}/view`;
}

const CATEGORY_LABEL_TO_KEY: Map<string, string> = new Map(DOCUMENT_TYPES.map((t) => [t.label, t.key]));
const ASSESSORIA_CATEGORY_LABEL_TO_KEY: Map<string, string> = new Map(
  Object.entries(ASSESSORIA_DOC_TYPE_FOLDERS)
    .filter(([key]) => key !== "PARECER")
    .map(([key, label]) => [label, key])
);
const PARECERES_FOLDER_LABEL = ASSESSORIA_DOC_TYPE_FOLDERS.PARECER;

export type UnlinkedFileItem = {
  kind: "ATTACHMENT" | "ASSESSORIA_DOCUMENTO";
  fileId: string;
  name: string;
  destino: string;
  docType: string;
  webViewLink?: string | null;
  caseId?: string;
  attendanceId?: string;
  assessoriaId?: string;
  parecerId?: string;
};

type CaseContainer = { id: string; title: string };
type AttendanceContainer = { id: string; subject: string };

async function planoContainerCase(officeId: string, folder: { id: string; name: string; mimeType: string }, registeredIds: Set<string>, itens: UnlinkedFileItem[]): Promise<void> {
  const c: CaseContainer | null = await prisma.case.findFirst({
    where: { officeId, OR: [{ driveFolderId: folder.id }, { driveFolderId: null, title: folder.name }] },
    select: { id: true, title: true },
  });
  if (!c) return; // pasta sem correspondência — fora do escopo desta tela

  const children = await listDriveChildren(officeId, folder.id);
  for (const child of children) {
    if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue; // arquivo solto fora de categoria — fora do escopo
    if (isReservedCaseSubfolder(child.name)) continue;
    const docTypeKey = CATEGORY_LABEL_TO_KEY.get(child.name);
    if (!docTypeKey) continue; // categoria desconhecida — fora do escopo

    const files = await listDriveChildren(officeId, child.id);
    for (const f of files) {
      if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
      if (registeredIds.has(f.id)) continue;
      itens.push({ kind: "ATTACHMENT", fileId: f.id, name: f.name, destino: `${c.title} → ${child.name}`, docType: docTypeKey, webViewLink: f.webViewLink, caseId: c.id });
    }
  }
}

async function planoContainerAtendimento(officeId: string, folder: { id: string; name: string; mimeType: string }, registeredIds: Set<string>, itens: UnlinkedFileItem[]): Promise<void> {
  const a: AttendanceContainer | null = await prisma.attendance.findFirst({
    where: { officeId, OR: [{ driveFolderId: folder.id }, { driveFolderId: null, subject: folder.name }] },
    select: { id: true, subject: true },
  });
  if (!a) return;

  const children = await listDriveChildren(officeId, folder.id);
  for (const child of children) {
    if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue;
    if (isReservedCaseSubfolder(child.name)) continue;
    const docTypeKey = CATEGORY_LABEL_TO_KEY.get(child.name);
    if (!docTypeKey) continue;

    const files = await listDriveChildren(officeId, child.id);
    for (const f of files) {
      if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
      if (registeredIds.has(f.id)) continue;
      itens.push({ kind: "ATTACHMENT", fileId: f.id, name: f.name, destino: `${a.subject} → ${child.name}`, docType: docTypeKey, webViewLink: f.webViewLink, attendanceId: a.id });
    }
  }
}

async function planoAssessoria(officeId: string, registeredIds: Set<string>, itens: UnlinkedFileItem[]): Promise<void> {
  const rootId = await getAssessoriaRootFolderId(officeId);
  const companyFolders = await listDriveChildren(officeId, rootId);

  for (const companyFolder of companyFolders) {
    if (companyFolder.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue;

    const assessoria = await prisma.assessoria.findFirst({
      where: { officeId, OR: [{ driveFolderId: companyFolder.id }, { driveFolderId: null, client: { name: companyFolder.name } }] },
      select: { id: true, client: { select: { name: true } } },
    });
    if (!assessoria) continue;

    const children = await listDriveChildren(officeId, companyFolder.id);
    for (const child of children) {
      if (child.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
        // Arquivo solto direto na raiz da empresa — esperado para OUTRO/ACAO_VINCULADA (mesma
        // exceção documentada em lib/driveSync.ts).
        if (registeredIds.has(child.id)) continue;
        itens.push({ kind: "ASSESSORIA_DOCUMENTO", fileId: child.id, name: child.name, destino: assessoria.client.name, docType: "OUTRO", webViewLink: child.webViewLink, assessoriaId: assessoria.id });
        continue;
      }

      if (child.name === PARECERES_FOLDER_LABEL) {
        const parecerFolders = await listDriveChildren(officeId, child.id);
        for (const parecerFolder of parecerFolders) {
          if (parecerFolder.mimeType !== DRIVE_FOLDER_MIME_TYPE) continue; // arquivo solto fora de pasta de parecer — fora do escopo
          const parecer = await prisma.parecer.findFirst({
            where: { officeId, assessoriaId: assessoria.id, OR: [{ driveFolderId: parecerFolder.id }, { driveFolderId: null, name: parecerFolder.name }] },
            select: { id: true, name: true },
          });
          if (!parecer) continue; // pasta de parecer sem correspondência — fora do escopo

          const parecerFiles = await listDriveChildren(officeId, parecerFolder.id);
          for (const f of parecerFiles) {
            if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
            if (registeredIds.has(f.id)) continue;
            itens.push({
              kind: "ASSESSORIA_DOCUMENTO",
              fileId: f.id,
              name: f.name,
              destino: `${assessoria.client.name} → Pareceres → ${parecer.name}`,
              docType: "OUTRO",
              webViewLink: f.webViewLink,
              assessoriaId: assessoria.id,
              parecerId: parecer.id,
            });
          }
        }
        continue;
      }

      const docTypeKey = ASSESSORIA_CATEGORY_LABEL_TO_KEY.get(child.name);
      if (!docTypeKey) continue; // categoria desconhecida — fora do escopo

      const categoryFiles = await listDriveChildren(officeId, child.id);
      for (const f of categoryFiles) {
        if (f.mimeType === DRIVE_FOLDER_MIME_TYPE) continue;
        if (registeredIds.has(f.id)) continue;
        itens.push({ kind: "ASSESSORIA_DOCUMENTO", fileId: f.id, name: f.name, destino: `${assessoria.client.name} → ${child.name}`, docType: docTypeKey, webViewLink: f.webViewLink, assessoriaId: assessoria.id });
      }
    }
  }
}

export async function planoArquivosNaoVinculados(): Promise<{ itens: UnlinkedFileItem[] } | { error: string }> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { error: "Apenas administradores podem rodar esta ação." };

  const officeId = user.officeId;
  const connected = await hasPrimaryDriveCredential(officeId);
  if (!connected) {
    return { error: "Google Drive não está conectado para este escritório. Vá em Configurações e conecte a conta do Google antes de rodar esta ação." };
  }

  const [processosRootId, casosRootId, atendimentosRootId] = await Promise.all([
    getProcessosRootFolderId(officeId),
    getCasosRootFolderId(officeId),
    getAtendimentosRootFolderId(officeId),
  ]);

  const [googleAttachments, googleAssessoriaDocs] = await Promise.all([
    prisma.attachment.findMany({ where: { officeId, storageProvider: "GOOGLE_DRIVE", storageFileId: { not: null } }, select: { storageFileId: true } }),
    prisma.assessoriaDocumento.findMany({ where: { officeId, storageProvider: "GOOGLE_DRIVE", storageFileId: { not: null } }, select: { storageFileId: true } }),
  ]);
  const registeredAttachmentIds = new Set(googleAttachments.map((a) => a.storageFileId).filter((id): id is string => Boolean(id)));
  const registeredAssessoriaDocIds = new Set(googleAssessoriaDocs.map((d) => d.storageFileId).filter((id): id is string => Boolean(id)));

  const itens: UnlinkedFileItem[] = [];

  for (const folder of await listDriveChildren(officeId, processosRootId)) {
    if (folder.mimeType === DRIVE_FOLDER_MIME_TYPE) await planoContainerCase(officeId, folder, registeredAttachmentIds, itens);
  }
  for (const folder of await listDriveChildren(officeId, casosRootId)) {
    if (folder.mimeType === DRIVE_FOLDER_MIME_TYPE) await planoContainerCase(officeId, folder, registeredAttachmentIds, itens);
  }
  for (const folder of await listDriveChildren(officeId, atendimentosRootId)) {
    if (folder.mimeType === DRIVE_FOLDER_MIME_TYPE) await planoContainerAtendimento(officeId, folder, registeredAttachmentIds, itens);
  }
  await planoAssessoria(officeId, registeredAssessoriaDocIds, itens);

  return { itens };
}

// Cria de fato o Attachment/AssessoriaDocumento só dos itens que a tela mandar (checkbox
// marcado) — mesmos campos que lib/driveSync.ts grava no caminho automático, pro registro ficar
// idêntico independente de qual caminho (cron ou esta ação manual) o criou.
export async function sincronizarArquivosSelecionados(
  itens: UnlinkedFileItem[]
): Promise<{ sincronizados: number; erros: string[] }> {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) return { sincronizados: 0, erros: ["Apenas administradores podem rodar esta ação."] };

  let sincronizados = 0;
  const erros: string[] = [];
  for (const item of itens) {
    try {
      if (item.kind === "ATTACHMENT") {
        await prisma.attachment.create({
          data: {
            officeId: user.officeId,
            name: item.name,
            driveUrl: driveFileUrl(item.fileId, item.webViewLink),
            docType: item.docType,
            storageProvider: "GOOGLE_DRIVE",
            storageFileId: item.fileId,
            uploadedById: null,
            caseId: item.caseId ?? null,
            attendanceId: item.attendanceId ?? null,
          },
        });
      } else {
        await prisma.assessoriaDocumento.create({
          data: {
            officeId: user.officeId,
            assessoriaId: item.assessoriaId!,
            parecerId: item.parecerId ?? null,
            name: item.name,
            docType: item.docType,
            driveUrl: driveFileUrl(item.fileId, item.webViewLink),
            storageProvider: "GOOGLE_DRIVE",
            storageFileId: item.fileId,
            uploadedById: null,
          },
        });
      }
      sincronizados++;
    } catch (e) {
      erros.push(`${item.name}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }
  return { sincronizados, erros };
}
