// Formato do arquivo (".pdf", ".docx", ".xlsx"...) pra exibir na coluna "Formato" do modo
// Detalhes de anexo/documento — ver components/AttachmentList.tsx e
// components/assessoria/AssessoriaDocumentosTab.tsx.
//
// Não existe campo de formato/mimetype gravado no banco (Attachment/AssessoriaDocumento só têm
// `name`, o nome de exibição escolhido no upload — editável, pode ou não reter a extensão real do
// arquivo). Por isso isto é uma DEDUÇÃO, não um dado gravado: tenta o nome primeiro, e só se o
// nome não tiver extensão reconhecível tenta o caminho da URL (Dropbox costuma incluir o nome do
// arquivo na URL; Google Drive/OneDrive não, e nesse caso o resultado fica "—" mesmo — mais
// honesto que chutar um formato que ninguém confirmou.
const EXTENSOES_RECONHECIDAS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "odt", "ods", "rtf",
  "md", "txt", "html", "xml", "json",
  "jpg", "jpeg", "png", "gif", "webp", "heic", "svg",
  "zip", "rar", "7z",
  "mp3", "mp4", "mov", "wav",
]);

function extensaoDoTexto(texto: string): string | null {
  const semQueryNemFragmento = texto.split(/[?#]/)[0];
  const match = semQueryNemFragmento.match(/\.([a-zA-Z0-9]{1,5})$/);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return EXTENSOES_RECONHECIDAS.has(ext) ? ext : null;
}

export function formatoArquivo(nome: string, driveUrl?: string | null): string {
  const ext = extensaoDoTexto(nome) ?? (driveUrl ? extensaoDoTexto(driveUrl) : null);
  return ext ? `.${ext}` : "—";
}
