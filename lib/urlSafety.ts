// Protocolos aceitos para links clicáveis fornecidos livremente pelo usuário (Task.meetingUrl,
// Case.tribunalLink) — qualquer outro esquema (ex.: javascript:, data:, vbscript:) é descartado
// em vez de gravado, fechando o XSS armazenado do achado F5 da auditoria de segurança
// (docs/security-audit/relatorio-auditoria-seguranca.pdf). Aplicado tanto na escrita
// (lib/actions/tasks.ts, lib/actions/cases.ts) quanto, como defesa em profundidade, na
// renderização (components/AgendaView.tsx, app/(app)/processos/[id]/page.tsx,
// app/m/processos/[id]/page.tsx) — um valor gravado antes desta correção continua sendo
// neutralizado na tela mesmo sem passar de novo pela Server Action.
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function sanitizeExternalUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(trimmed).protocol) ? trimmed : null;
  } catch {
    return null; // URL malformada/relativa — não faz sentido para um link externo, descarta
  }
}
