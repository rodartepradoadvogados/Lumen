"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice } from "@/lib/officeScope";
import { isDocumentoEnvioMetodo } from "@/lib/documentoEnvios";
import { sendEmailReply } from "@/lib/gmailSend";
import { downloadDriveFile, inferMimeTypeFromFileName, type StorageProvider } from "@/lib/storageProvider";
import { extractDriveFileId } from "@/lib/googleDrive";

// Server actions do botão "Enviar E-mail/WhatsApp" da aba Protocolos (ver lib/documentoEnvios.ts
// para a rotina de domínio e prisma/schema.prisma para DocumentoEnvio/DocumentoEnvioItem).
//
// Um envio só REFERENCIA documentos (attachmentId) — nenhuma função aqui faz upload nem copia
// arquivo. Mas, diferente de antes, o método EMAIL agora manda o e-mail de verdade, com o
// conteúdo real dos documentos anexado (ver enviarDocumentosPorEmail abaixo) — só o método
// WHATSAPP continua sendo "registro + link de conveniência" (wa.me), sem nenhum envio real (ver
// lib/documentoEnvios.ts).

// ---------------------------------------------------------------------------
// Contatos sugeridos (Client/Lawyer/Supplier do escritório) para preencher o destinatário
// ---------------------------------------------------------------------------

export type ContatoEnvio = {
  id: string;
  tipo: "CLIENTE" | "ADVOGADO" | "FORNECEDOR";
  name: string;
  contato: string; // e-mail ou telefone, conforme o método pedido
};

// Contatos do escritório (não só deste processo — um documento pode ir para qualquer cliente,
// advogado da parte contrária/parceiro ou fornecedor cadastrado) que têm o campo pedido
// preenchido. Filtragem por nome fica a cargo do cliente (lista pequena o bastante para não
// precisar de busca no servidor a cada tecla — mesmo padrão de EntityPicker).
export async function listarContatosEnvio(caseId: string, metodo: string): Promise<ContatoEnvio[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  if (!isDocumentoEnvioMetodo(metodo)) return [];
  if (!(await isCaseInOffice(caseId, viewer.officeId))) return [];

  // Prisma não aceita chave de campo dinâmica no tipo de `where` (o nome da coluna precisa ser
  // literal para o TypeScript resolver o tipo certo) — daí o `where` completo variar por `metodo`
  // em vez de montar um objeto com `[campo]` computado.
  const filtro = metodo === "EMAIL" ? { email: { not: null } } : { phone: { not: null } };

  const [clients, lawyers, suppliers] = await Promise.all([
    prisma.client.findMany({
      where: { officeId: viewer.officeId, ...filtro },
      select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.lawyer.findMany({
      where: { officeId: viewer.officeId, ...filtro },
      select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.supplier.findMany({
      where: { officeId: viewer.officeId, ...filtro },
      select: { id: true, name: true, email: true, phone: true },
    }),
  ]);

  const toContato = (v: { email: string | null; phone: string | null }) => (metodo === "EMAIL" ? v.email : v.phone);

  const lista: ContatoEnvio[] = [
    ...clients.map((c) => ({ id: c.id, tipo: "CLIENTE" as const, name: c.name, contato: toContato(c) ?? "" })),
    ...lawyers.map((l) => ({ id: l.id, tipo: "ADVOGADO" as const, name: l.name, contato: toContato(l) ?? "" })),
    ...suppliers.map((s) => ({ id: s.id, tipo: "FORNECEDOR" as const, name: s.name, contato: toContato(s) ?? "" })),
  ].filter((c) => c.contato.trim() !== "");

  return lista.sort((a, b) => a.name.localeCompare(b.name));
}

// Reordena uma lista de registros (já buscados do banco, em qualquer ordem) para bater com a
// ordem em que os ids chegaram do cliente — e descarta silenciosamente qualquer id que não
// resolveu (mesmo comportamento de createProtocoloLote: um id inválido não barra o resto).
// Genérico o bastante para servir tanto registrarEnvioDocumentos (select mínimo) quanto
// enviarDocumentosPorEmail (select com os campos extras de armazenamento) sem precisar de um
// `select` dinâmico no Prisma (que perderia a tipagem exata de cada chamador).
function ordenarPelosIds<T extends { id: string }>(ids: string[], items: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

// ---------------------------------------------------------------------------
// Registrar o envio por WHATSAPP (o ato de "deixar rastro" — não envia nada de verdade, ver
// comentário no topo do arquivo e em lib/documentoEnvios.ts).
// ---------------------------------------------------------------------------

export async function registrarEnvioDocumentos(data: {
  caseId: string;
  metodo: string;
  destinatarioNome: string;
  destinatarioContato: string;
  attachmentIds: string[];
}): Promise<{ id?: string; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!isDocumentoEnvioMetodo(data.metodo)) return { error: "Método inválido." };
  // EMAIL agora manda de verdade (ver enviarDocumentosPorEmail) — este caminho de "só registro +
  // link de conveniência" continua existindo exclusivamente para WHATSAPP.
  if (data.metodo !== "WHATSAPP") return { error: "Método inválido para este registro — use o envio por e-mail." };
  if (!data.destinatarioNome.trim()) return { error: "Informe o nome do destinatário." };
  if (!data.destinatarioContato.trim()) return { error: "Informe o telefone do destinatário." };
  if (data.attachmentIds.length === 0) return { error: "Selecione ao menos um documento." };
  if (!(await isCaseInOffice(data.caseId, viewer.officeId))) return { error: "Processo não encontrado." };

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: data.attachmentIds }, officeId: viewer.officeId, caseId: data.caseId },
    select: { id: true, name: true, docType: true },
  });
  const ordered = ordenarPelosIds(data.attachmentIds, attachments);
  if (ordered.length === 0) return { error: "Nenhum dos documentos selecionados foi encontrado." };

  const envio = await prisma.documentoEnvio.create({
    data: {
      metodo: "WHATSAPP",
      destinatarioNome: data.destinatarioNome.trim(),
      destinatarioContato: data.destinatarioContato.trim(),
      caseId: data.caseId,
      officeId: viewer.officeId,
      enviadoPorId: viewer.id,
      itens: {
        create: ordered.map((a) => ({
          attachmentId: a.id,
          nomeSnapshot: a.name,
          docTypeSnapshot: a.docType,
        })),
      },
    },
  });

  revalidatePath(`/processos/${data.caseId}`);
  return { id: envio.id };
}

// ---------------------------------------------------------------------------
// Enviar por EMAIL (a correção pedida): baixa o conteúdo real de cada documento do provedor de
// armazenamento onde ele está guardado, monta os anexos e manda o e-mail de verdade pela conta
// Google/Microsoft que a pessoa conectou em Configurações (ver lib/gmailSend.ts:sendEmailReply).
// Só grava o registro DocumentoEnvio/DocumentoEnvioItem se o e-mail REALMENTE saiu — diferente do
// WHATSAPP (que grava sempre, já que ali o registro é o único "envio" que de fato acontece por
// aqui), um registro de "documento enviado" só faz sentido quando o envio de verdade teve
// sucesso; em caso de erro, nada é gravado, para a pessoa poder corrigir e tentar de novo sem
// duplicar o histórico.
// ---------------------------------------------------------------------------

const LIMITE_ANEXO_EMAIL_BYTES = 20 * 1024 * 1024; // 20MB — folga em relação ao limite prático de ~25MB do envio "raw" do Gmail (a codificação base64 infla o payload em ~33%).

export async function enviarDocumentosPorEmail(data: {
  caseId: string;
  destinatarioNome: string;
  destinatarioContato: string;
  attachmentIds: string[];
  mensagem: string;
}): Promise<{ id?: string; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!data.destinatarioNome.trim()) return { error: "Informe o nome do destinatário." };
  if (!data.destinatarioContato.trim()) return { error: "Informe o e-mail do destinatário." };
  if (data.attachmentIds.length === 0) return { error: "Selecione ao menos um documento." };
  if (!data.mensagem.trim()) return { error: "Escreva uma mensagem para o e-mail." };

  const c = await prisma.case.findFirst({ where: { id: data.caseId, officeId: viewer.officeId }, select: { id: true, title: true } });
  if (!c) return { error: "Processo não encontrado." };

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: data.attachmentIds }, officeId: viewer.officeId, caseId: data.caseId },
    select: { id: true, name: true, docType: true, driveUrl: true, storageProvider: true, storageFileId: true },
  });
  const ordered = ordenarPelosIds(data.attachmentIds, attachments);
  if (ordered.length === 0) return { error: "Nenhum dos documentos selecionados foi encontrado." };

  // Baixa o conteúdo de todos em paralelo, mas a falha de UM documento aborta o envio inteiro —
  // um e-mail "incompleto" (faltando um dos documentos pedidos) não deve sair silenciosamente.
  const downloads = await Promise.allSettled(
    ordered.map(async (a) => {
      const provider: StorageProvider = a.storageProvider === "ONEDRIVE" || a.storageProvider === "DROPBOX" ? a.storageProvider : "GOOGLE_DRIVE";
      let fileId = a.storageFileId;
      if (!fileId && provider === "GOOGLE_DRIVE") fileId = extractDriveFileId(a.driveUrl);
      if (!fileId) {
        throw new Error(`"${a.name}": não foi possível identificar o arquivo no armazenamento (registro antigo sem id salvo — reenvie o documento pela aba Anexos).`);
      }
      try {
        const { content, mimeType } = await downloadDriveFile(fileId, viewer.officeId, provider);
        const resolvedMimeType = !mimeType || mimeType === "application/octet-stream" ? inferMimeTypeFromFileName(a.name) : mimeType;
        return { attachmentId: a.id, name: a.name, docType: a.docType, content, mimeType: resolvedMimeType };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "erro desconhecido";
        throw new Error(`"${a.name}": ${msg}`);
      }
    })
  );

  const falhas = downloads.filter((d): d is PromiseRejectedResult => d.status === "rejected");
  if (falhas.length > 0) {
    const detalhes = falhas.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason))).join(" | ");
    return {
      error: `Não foi possível baixar ${falhas.length === 1 ? "um dos documentos selecionados" : `${falhas.length} dos documentos selecionados`} — nenhum e-mail foi enviado. ${detalhes}`,
    };
  }
  const baixados = downloads.map(
    (d) => (d as PromiseFulfilledResult<{ attachmentId: string; name: string; docType: string; content: Buffer; mimeType: string }>).value
  );

  const totalBytes = baixados.reduce((sum, d) => sum + d.content.length, 0);
  if (totalBytes > LIMITE_ANEXO_EMAIL_BYTES) {
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    return {
      error: `Os documentos selecionados somam ${totalMb}MB — o limite de anexo por e-mail é 20MB. Use o Protocolo (que gera link do Drive) para arquivos grandes.`,
    };
  }

  const result = await sendEmailReply(
    viewer.id,
    data.destinatarioContato.trim(),
    `Documentos — ${c.title}`,
    data.mensagem.trim(),
    baixados.map((d) => ({ filename: d.name, mimeType: d.mimeType, content: d.content }))
  );
  if (!result.ok) return { error: result.error || "Falha ao enviar o e-mail." };

  const envio = await prisma.documentoEnvio.create({
    data: {
      metodo: "EMAIL",
      destinatarioNome: data.destinatarioNome.trim(),
      destinatarioContato: data.destinatarioContato.trim(),
      caseId: data.caseId,
      officeId: viewer.officeId,
      enviadoPorId: viewer.id,
      itens: {
        create: baixados.map((d) => ({
          attachmentId: d.attachmentId,
          nomeSnapshot: d.name,
          docTypeSnapshot: d.docType,
        })),
      },
    },
  });

  revalidatePath(`/processos/${data.caseId}`);
  return { id: envio.id };
}

// ---------------------------------------------------------------------------
// Links atuais dos anexos de um envio já registrado (histórico) — usado ao "Reabrir" um envio
// WHATSAPP: DocumentoEnvioItem só guarda nomeSnapshot/docTypeSnapshot (snapshot proposital, para
// sobreviver à exclusão do Attachment original), nunca a URL, porque ela pode mudar/expirar; a
// URL de verdade é sempre buscada aqui, na hora, a partir do attachmentId. Um id que não resolver
// mais (Attachment excluído) simplesmente não aparece no mapa devolvido — o chamador trata como
// "documento excluído".
// ---------------------------------------------------------------------------

export async function buscarUrlsDeAnexos(attachmentIds: string[]): Promise<Record<string, string>> {
  const viewer = await getCurrentUser();
  if (!viewer || attachmentIds.length === 0) return {};

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: attachmentIds }, officeId: viewer.officeId },
    select: { id: true, driveUrl: true },
  });
  return Object.fromEntries(attachments.map((a) => [a.id, a.driveUrl]));
}

// Apaga um registro de envio feito por engano (destinatário errado, documento errado etc.) — não
// existe edição: como é um registro histórico simples (sem ciclo de vida, ao contrário do
// protocolo), refazer do zero é mais simples e menos arriscado que um fluxo de edição parcial.
export async function excluirEnvioDocumentos(envioId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const envio = await prisma.documentoEnvio.findFirst({ where: { id: envioId, officeId: viewer.officeId } });
  if (!envio) return { error: "Registro não encontrado." };

  await prisma.documentoEnvio.delete({ where: { id: envioId } });
  revalidatePath(`/processos/${envio.caseId}`);
  return {};
}
