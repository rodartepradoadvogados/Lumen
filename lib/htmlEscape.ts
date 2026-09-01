// Escapa texto de usuário antes de entrar num template HTML de e-mail (achado F4 da auditoria
// de segurança, docs/security-audit/) — nomes, títulos, comentários e outros campos de texto
// livre são montados direto em string HTML nesses templates (lib/email.ts,
// lib/notificationOutboxDrain.ts, lib/emailTemplateRender.ts), sem passar pelo escape
// automático que o React já faz na tela. Sem isso, um `<img src=x onerror=...>` digitado num
// comentário ou título de tarefa ia cru pro corpo do e-mail. NÃO aplicar ao HTML do próprio
// template (EmailTemplate.bodyHtml, editado pelo admin em components/comunicados/TemplateEditor.tsx)
// — esse é HTML de verdade por design; só às VARIÁVEIS que entram nele.
export function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
