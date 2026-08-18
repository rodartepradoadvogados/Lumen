// Base URL pública deste deploy — usada por e-mails (link de redefinição de senha, convite),
// robots.txt/sitemap.xml e qualquer redirect_uri de OAuth que precise de uma URL absoluta.
// Cadeia: APP_URL (configuração explícita, preferida em produção) → VERCEL_URL (preview
// deployments, sem protocolo — a Vercel injeta sozinha) → localhost (dev). Antes desta função
// existir, quatro cópias divergentes resolviam a mesma pergunta de jeitos diferentes — duas com
// esta cadeia completa (lib/actions/auth.ts, lib/actions/painelMestre.ts), duas mais rasas sem o
// fallback de preview (app/robots.ts, app/sitemap.ts) — e o BTG usava uma quinta variável
// (NEXT_PUBLIC_APP_URL) que ninguém preenchia, caindo sempre num hostname fixo no código (achado
// A10 da revisão gauntlet).
export function getAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
