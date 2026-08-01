import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getOAuthClient, extractDriveFileId, GOOGLE_DOC_MIME } from "@/lib/googleDrive";
import { formatShortcutName } from "@/lib/protocolos";
import { buildZipBuffer } from "@/lib/protocoloZip";

export const dynamic = "force-dynamic";

// "Baixar tudo (.zip)" de um lote de protocolo (item 4 da Fase 3/4).
//
// Investigação feita ANTES de escrever este endpoint (era o pré-requisito do pedido): a pasta do
// lote no Drive (ver gerarPastaDoLote em lib/actions/protocolos.ts) contém só ATALHOS
// (mimeType "application/vnd.google-apps.shortcut"), nunca os arquivos em si. A API do Drive
// (files.get com alt=media) NÃO resolve um atalho automaticamente — pedir o conteúdo usando o id
// do atalho falha, é preciso usar shortcutDetails.targetId (documentado pela própria Google: "when
// you use a method that operates on file content [...] you can't use the shortcut ID, you have to
// use the ID from shortcutDetails.targetId"). Ou seja, sim, estava genuinamente quebrado se a
// gente lesse a PASTA do Drive e baixasse os atalhos direto.
//
// Mas este endpoint não precisa ler a pasta do Drive nem lidar com esse problema: o banco já sabe
// exatamente qual é o arquivo REAL de cada item (ProtocoloLoteItem.attachmentId ->
// Attachment.storageFileId, o mesmo id que vira shortcutDetails.targetId ao criar o atalho — ver
// gerarPastaDoLote). Então cada documento é baixado direto pelo id do arquivo real, o atalho nunca
// entra na jogada. resolveConteudo() abaixo ainda trata o caso mimeType=shortcut como rede de
// segurança (encaminha para o alvo em vez de falhar) — defensivo, não deveria ser exercitado no
// caminho normal, mas mantém o endpoint correto mesmo se um dia passar a ler direto do Drive.
export async function GET(request: NextRequest, { params }: { params: { loteId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });

  const lote = await prisma.protocoloLote.findFirst({
    where: { id: params.loteId, officeId: viewer.officeId },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
  if (!lote) return NextResponse.json({ error: "Protocolo não encontrado." }, { status: 404 });

  const cred = await prisma.googleCredential.findFirst({ where: { officeId: viewer.officeId, isPrimaryDrive: true } });
  if (!cred) {
    return NextResponse.json({ error: "Google Drive não conectado. Vá em Configurações e conecte a conta do Google do seu escritório." }, { status: 400 });
  }
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: cred.refreshToken });
  const drive = google.drive({ version: "v3", auth: client });

  const attachmentIds = lote.itens.map((i) => i.attachmentId).filter((id): id is string => Boolean(id));
  const attachments = await prisma.attachment.findMany({
    where: { id: { in: attachmentIds } },
    select: { id: true, driveUrl: true, storageFileId: true, storageProvider: true },
  });
  const attachmentById = new Map(attachments.map((a) => [a.id, a]));

  const entries: { name: string; data: Buffer }[] = [];
  let ignorados = 0;

  for (const item of lote.itens) {
    const attachment = item.attachmentId ? attachmentById.get(item.attachmentId) : null;
    if (!attachment || attachment.storageProvider !== "GOOGLE_DRIVE") {
      ignorados++; // sem anexo original, ou guardado em outro provedor (Dropbox/OneDrive) — sem id de arquivo do Drive pra baixar
      continue;
    }
    const fileId = attachment.storageFileId || extractDriveFileId(attachment.driveUrl);
    if (!fileId) {
      ignorados++;
      continue;
    }

    try {
      const { data, extensaoSugerida } = await baixarConteudo(drive, fileId);
      const nome = formatShortcutName(item.ordem, comExtensao(item.nomeSnapshot, extensaoSugerida));
      entries.push({ name: nome, data });
    } catch {
      ignorados++; // um documento com problema (removido no Drive, sem permissão etc.) não deve derrubar o zip inteiro
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "Nenhum documento deste protocolo pôde ser baixado do Drive." }, { status: 400 });
  }

  const zip = buildZipBuffer(entries);
  const nomeArquivo = `${lote.titulo.replace(/[/\\]/g, "-")}.zip`;

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="protocolo.zip"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`,
      "Content-Length": String(zip.length),
      // Não expõe se algum documento foi ignorado no header — a tela não lê isso hoje; se um dia
      // precisar avisar, dá pra promover pra um endpoint que devolve JSON com um link assinado.
      "X-Protocolo-Ignorados": String(ignorados),
    },
  });
}

// Baixa o conteúdo real de um arquivo do Drive, com dois desvios do caminho feliz (arquivo
// binário comum -> alt=media):
// - Atalho (mimeType shortcut): seria um erro da API pedir o conteúdo pelo id do atalho — segue
//   para shortcutDetails.targetId (ver comentário no topo do arquivo). Rede de segurança, o
//   caminho normal já usa o id do arquivo real (attachment.storageFileId), nunca o de um atalho.
// - Google Doc nativo (documentos gerados a partir de modelo .docx, ver copyAndFillTemplate em
//   lib/googleDrive.ts): não tem bytes próprios pra baixar (alt=media falha) — precisa exportar,
//   aqui como PDF, o formato que faz sentido dentro de um protocolo.
async function baixarConteudo(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<{ data: Buffer; extensaoSugerida: string | null }> {
  const meta = await drive.files.get({ fileId, fields: "id,mimeType,shortcutDetails" });

  if (meta.data.mimeType === "application/vnd.google-apps.shortcut") {
    const targetId = meta.data.shortcutDetails?.targetId;
    if (!targetId) throw new Error("Atalho sem destino.");
    return baixarConteudo(drive, targetId);
  }

  if (meta.data.mimeType === GOOGLE_DOC_MIME) {
    const res = await drive.files.export({ fileId, mimeType: "application/pdf" }, { responseType: "arraybuffer" });
    return { data: Buffer.from(res.data as ArrayBuffer), extensaoSugerida: "pdf" };
  }

  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return { data: Buffer.from(res.data as ArrayBuffer), extensaoSugerida: null };
}

function comExtensao(nome: string, extensaoSugerida: string | null): string {
  if (!extensaoSugerida) return nome;
  return /\.[a-z0-9]{1,6}$/i.test(nome) ? nome : `${nome}.${extensaoSugerida}`;
}
