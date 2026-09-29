// Os três PWAs do Lúmen e as suas telas de entrada. Sem nenhuma dependência de Node: este
// módulo é importado pelo middleware (Edge) e por componentes.
//
// Cada app instalável tem um ESCOPO próprio e a sua tela de entrada DENTRO desse escopo.
// Motivo (medido em produção, Android/Chrome): quem abria /atendimento-app sem sessão era
// mandado para a homepage pública, que não pertence a nenhum PWA e liga o manifesto raiz — o
// Chrome então oferecia instalar o app ERRADO ("Lúmen", mobile) e, depois do login, o usuário
// caía no site. Com a entrada dentro do escopo, o <head> da tela de login já liga o manifesto
// certo, o convite de instalação é o do app certo e o login volta para o próprio app.

export type PwaApp = "mobile" | "atendimento";

export const PWA_APPS: Record<PwaApp, { base: string; entrar: string; manifest: string }> = {
  mobile: { base: "/m", entrar: "/m/entrar", manifest: "/manifest.webmanifest" },
  atendimento: {
    base: "/atendimento-app",
    entrar: "/atendimento-app/entrar",
    manifest: "/atendimento-app/manifest.webmanifest",
  },
};

/** Devolve a qual PWA (com escopo próprio) o caminho pertence, ou null para o site. */
export function pwaDoCaminho(pathname: string): PwaApp | null {
  for (const app of Object.keys(PWA_APPS) as PwaApp[]) {
    const { base } = PWA_APPS[app];
    if (pathname === base || pathname.startsWith(base + "/")) return app;
  }
  return null;
}

/** true para as telas de entrada de cada PWA (públicas: não exigem sessão). */
export function ehTelaDeEntradaDePwa(pathname: string): boolean {
  return (Object.values(PWA_APPS) as { entrar: string }[]).some((a) => pathname === a.entrar);
}

/**
 * Destino pós-login aceito para uma tela de entrada de PWA: só caminhos DENTRO do escopo do
 * próprio app (nunca a própria tela de entrada). Qualquer outra coisa cai na raiz do app.
 */
export function destinoSeguroDoPwa(app: PwaApp, next: string | string[] | undefined): string {
  const { base, entrar } = PWA_APPS[app];
  const valor = Array.isArray(next) ? next[0] : next;
  if (!valor || !valor.startsWith("/") || valor.startsWith("//")) return base;
  if (valor === entrar || valor.startsWith(entrar + "?")) return base;
  if (valor === base || valor.startsWith(base + "/") || valor.startsWith(base + "?")) return valor;
  return base;
}

/** Celular/tablet por User-Agent — usado só para decidir qual manifesto oferecer. */
export function ehAparelhoMovel(userAgent: string | null | undefined): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? "");
}
