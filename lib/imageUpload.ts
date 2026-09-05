// SEGURANÇA (achado V12, auditoria de 05/09/2026): app/api/photos/upload e
// app/api/perfil/foto/upload aceitavam qualquer `file.type` que começasse com "image/" — inclui
// image/svg+xml, que não é uma imagem rasterizada: é um documento XML que pode conter <script>.
// Um SVG malicioso enviado assim (biblioteca de fotos é upload restrito a admin, mas foto de
// perfil é autosserviço de QUALQUER usuário logado) fica hospedado no Vercel Blob e, se um dia
// for aberto direto no navegador (nova aba a partir da URL, em vez de só usado como <img src>),
// executa o script no contexto de origem do blob — e `file.type` é só o que o NAVEGADOR do
// remetente declarou, não uma verificação de conteúdo real. Lista fechada, sem X-por-X (SVG
// incluso ou qualquer outro tipo baseado em XML/script não é aceito em nenhuma das duas rotas).
export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function isAllowedImageMimeType(type: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(type);
}
