import { prisma } from "@/lib/prisma";
import { restoDoNomeDeMidiaSemNome } from "@/lib/driveNaming";
import { downloadDriveFile, type StorageProvider } from "@/lib/storageProvider";
import { extractDriveFileId } from "@/lib/googleDrive";
import { lerMidia } from "@/lib/mensagensDoChat";
import type { AnexoDaMidia, MensagemDaMidia, PortasDaMidia } from "@/lib/midiaDoChatServico";

// O LADO DE BANCO E DE DRIVE DA ROTA DE MÍDIA. ATENÇÃO: nada aqui confere o dono da conversa — quem monta as
// portas passa `guarda` (atendimentoDaRota) primeiro, em lib/midiaDoChatServico.ts. Toda consulta leva
// `attendanceId` E `officeId` no WHERE (segundo cinto).

export async function acharMensagemDaMidia(q: { id: string; attendanceId: string; officeId: string }): Promise<MensagemDaMidia | null> {
  return prisma.whatsappMessage.findFirst({
    where: { id: q.id, attendanceId: q.attendanceId, officeId: q.officeId },
    select: { id: true, direction: true, body: true, waMessageId: true, attachmentId: true, midiaMime: true, midiaBytes: true },
  });
}

const SELECT_DO_ANEXO = { id: true, name: true, driveUrl: true, storageProvider: true, storageFileId: true } as const;

/**
 * O arquivo desta mensagem, SEMPRE dentro da mesma conversa e do mesmo escritório.
 *   1. `attachmentId` gravado no ingest (mídia nova);
 *   2. mídia anterior à coluna e SEM nome original (foto, áudio, vídeo): o nome do arquivo no Drive termina em
 *      `-<hash do id da mensagem>.<ext>` (lib/driveNaming.ts). Documento com nome do cliente não é achável assim
 *      (dois iguais no mesmo dia colidiriam), e vira "indisponível" em vez de arriscar o arquivo errado.
 */
export async function acharAnexoDaMidia(m: MensagemDaMidia, q: { attendanceId: string; officeId: string }): Promise<AnexoDaMidia | null> {
  if (m.attachmentId) {
    return prisma.attachment.findFirst({ where: { id: m.attachmentId, attendanceId: q.attendanceId, officeId: q.officeId }, select: SELECT_DO_ANEXO });
  }
  const midia = lerMidia(m.body);
  if (!midia || midia.nome || !m.waMessageId) return null;
  const achados = await prisma.attachment.findMany({
    where: { attendanceId: q.attendanceId, officeId: q.officeId, docType: "MIDIA_WHATSAPP", name: { contains: `-${restoDoNomeDeMidiaSemNome(m.waMessageId)}.` } },
    select: SELECT_DO_ANEXO,
    take: 2,
  });
  // Dois arquivos com o mesmo hash curto: não se sabe qual é; melhor "indisponível" que a mídia de outra mensagem.
  return achados.length === 1 ? achados[0] : null;
}

function provedorDe(p: string): StorageProvider {
  return p === "ONEDRIVE" ? "ONEDRIVE" : p === "DROPBOX" ? "DROPBOX" : "GOOGLE_DRIVE";
}

export async function baixarAnexoDaMidia(a: AnexoDaMidia, officeId: string): Promise<{ content: Buffer; mimeType: string }> {
  const id = a.storageFileId || extractDriveFileId(a.driveUrl);
  if (!id) throw new Error("anexo sem id de arquivo");
  return downloadDriveFile(id, officeId, provedorDe(a.storageProvider));
}

/** As portas de verdade (menos a guarda, que a rota monta com `atendimentoDaRota`). */
export const PORTAS_DE_BANCO_DA_MIDIA: Omit<PortasDaMidia, "guarda"> = {
  acharMensagem: acharMensagemDaMidia,
  acharAnexo: acharAnexoDaMidia,
  baixar: baixarAnexoDaMidia,
};
