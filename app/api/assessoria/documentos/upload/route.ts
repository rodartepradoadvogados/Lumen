import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import {
  uploadFileToDrive,
  uploadFileToDriveFolder,
  getOrCreateParecerFolder,
  getOrCreateAssessoriaCompanyFolderCached,
  getOrCreateCategoryFolder,
} from "@/lib/storageProvider";
import { translateDriveError, ASSESSORIA_DOC_TYPE_FOLDERS } from "@/lib/googleDrive";
import { isValidBlobUrl } from "@/lib/blobUrl";

// Etapa 2 do upload de documentos da Assessoria (ver app/api/attachments/blob-token/route.ts para
// a etapa 1, reaproveitada aqui — o token endpoint é genérico, não sabe nem precisa saber se o
// arquivo é um Anexo de processo ou um Documento de Assessoria). Antes desta entrega esta rota
// recebia o arquivo INTEIRO via formData() (limite de payload de uma Vercel Serverless Function,
// bem menor que os 25MB que o front dizia suportar — era a causa real de "Erro ao enviar. Verifique
// sua conexão." em qualquer PDF grande). Agora o navegador já subiu o arquivo direto pro Vercel
// Blob (ver components/assessoria/AssessoriaDocumentosTab.tsx e
// components/assessoria/ParecerFolderRow.tsx) — aqui só chega a URL do Blob (payload pequeno),
// e o fluxo termina: baixa o conteúdo, manda pro provedor de armazenamento do escritório (Drive/
// OneDrive/Dropbox, ver lib/storageProvider.ts) e apaga o Blob temporário.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const { blobUrl, name, contentType, docType, assessoriaId, parecerId } = body as Record<string, unknown>;

  if (typeof blobUrl !== "string" || !blobUrl || !isValidBlobUrl(blobUrl)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (typeof assessoriaId !== "string" || !assessoriaId) {
    return NextResponse.json({ error: "Assessoria inválida." }, { status: 400 });
  }

  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId }, include: { client: true } });
  if (!assessoria) {
    return NextResponse.json({ error: "Assessoria não encontrada." }, { status: 404 });
  }

  let parecer: { id: string; name: string } | null = null;
  if (typeof parecerId === "string" && parecerId) {
    parecer = await prisma.parecer.findFirst({ where: { id: parecerId, assessoriaId, officeId: user.officeId }, select: { id: true, name: true } });
    if (!parecer) {
      return NextResponse.json({ error: "Parecer não encontrado." }, { status: 404 });
    }
  }

  const fileName = typeof name === "string" && name ? name : "documento";
  const mimeType = typeof contentType === "string" && contentType ? contentType : "application/octet-stream";
  const finalDocType = typeof docType === "string" && docType ? docType : "OUTRO";

  let buffer: Buffer;
  try {
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error("download falhou");
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Erro ao processar o arquivo enviado. Tente novamente." }, { status: 502 });
  }

  // Resolve a pasta de destino ANTES de subir o arquivo — se isso falhar (Drive não conectado,
  // token revogado, escopo insuficiente), sai aqui, sem upload e sem registro no banco. Nunca
  // "sobe pela metade": ou sobe e registra, ou nenhuma das duas coisas acontece (ver comentário em
  // translateDriveError, lib/googleDrive.ts).
  let folderId: string | null = null;
  try {
    if (parecer) {
      folderId = await getOrCreateParecerFolder(parecer.id, assessoria.client.name, parecer.name, user.officeId);
    } else {
      // Correção de 05/09/2026 (docs/auditoria-pastas-drive-2026-09.md, achados P0 e P1): antes,
      // esse ramo lia assessoria.driveFolderId direto do banco (sem verificar se a pasta ainda
      // existe — P0) e sempre soltava o documento na raiz da empresa, nunca na subpasta certa por
      // tipo (P1; só "Reorganizar anexos" corrigia isso depois, retroativamente). Agora resolve
      // com auto-cura (getOrCreateAssessoriaCompanyFolderCached) e já desce pra subpasta do
      // docType (Contratos/Licitações/Regimentos Internos), igual ao que
      // resolverDestinoAssessoriaDocumento (lib/actions/driveReorg.ts) já fazia só na reorganização.
      // OUTRO/ACAO_VINCULADA não têm subpasta própria por desenho — ficam na raiz da empresa.
      const companyFolderId = await getOrCreateAssessoriaCompanyFolderCached(assessoria.id, assessoria.client.name, user.officeId);
      const subName = ASSESSORIA_DOC_TYPE_FOLDERS[finalDocType];
      folderId = subName ? await getOrCreateCategoryFolder(companyFolderId, subName, user.officeId) : companyFolderId;
    }
  } catch (e) {
    console.error("[assessoria/documentos/upload] falha ao resolver pasta de destino:", e);
    return NextResponse.json({ error: translateDriveError(e, "preparar a pasta de destino no Drive") }, { status: 502 });
  }

  try {
    const result = folderId
      ? await uploadFileToDriveFolder(fileName, mimeType, buffer, folderId, user.officeId)
      : await uploadFileToDrive(fileName, mimeType, buffer, user.officeId);

    const doc = await prisma.assessoriaDocumento.create({
      data: {
        officeId: user.officeId,
        assessoriaId,
        name: fileName,
        docType: finalDocType,
        driveUrl: result.webViewLink,
        uploadedById: user.id,
        storageProvider: result.storageProvider,
        storageFileId: result.id,
        parecerId: parecer?.id || null,
      },
    });

    del(blobUrl).catch(() => {});

    return NextResponse.json({ id: doc.id, name: doc.name, driveUrl: doc.driveUrl });
  } catch (e) {
    // Não cria o AssessoriaDocumento — o upload falhou, então não há nada pra registrar. Sem
    // isso, um erro de rede no meio do envio deixaria um documento "fantasma" no catálogo sem
    // arquivo nenhum por trás (ou, pior, apontando pra um link que nunca existiu).
    console.error("[assessoria/documentos/upload] falha ao enviar arquivo para o provedor de armazenamento:", e);
    return NextResponse.json({ error: translateDriveError(e, "enviar o documento para o Drive") }, { status: 502 });
  }
}
