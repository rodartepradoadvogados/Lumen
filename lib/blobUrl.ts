// Validação da URL recebida na "etapa 2" dos uploads de duas etapas (Anexos de Processo/
// Atendimento em lib/actions/attachments.ts:finalizeAttachmentUpload, Documentos da Assessoria em
// app/api/assessoria/documentos/upload/route.ts) — o navegador já subiu o arquivo pro Vercel Blob
// (etapa 1, app/api/attachments/blob-token/route.ts) e manda de volta só a URL; o servidor faz
// `fetch(blobUrl)` nessa URL sem checar de onde ela veio. Sem esta validação, um chamador
// autenticado pode mandar QUALQUER URL (ex.: um endereço de metadados de rede interna) e o
// servidor a baixa e devolve o conteúdo — SSRF com canal de leitura, não cego (o resultado vira
// documento salvo e visível). Exige https e host terminando em ".blob.vercel-storage.com", o
// domínio real que o SDK do Vercel Blob devolve.
export function isValidBlobUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com");
}
