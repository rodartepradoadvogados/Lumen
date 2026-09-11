// Mecanismo de tema do portal interno (app/(app)/*) — Manhã / Noite, independente do tema do
// site público (lib/theme.ts, chave "rp-site-theme") e do app mobile
// (components/mobile/MobileThemeToggle.tsx, chave "rp-mobile-theme"). Mesmo motivo que os dois já
// são independentes entre si (ver comentário de THEME_KEY em lib/theme.ts): o portal pode ficar
// sempre em Noite mesmo que o site público continue em Manhã, sem um afetar o outro.
//
// Diferente do site (padrão "light"), o portal tem padrão "dark" — decisão registrada em
// .impeccable/plano-portal/andamento-portal.md (Rodada 0) e DESIGN.md ("Portal Noturno").
export type PortalThemeMode = "light" | "dark";

export const PORTAL_THEME_KEY = "rp-portal-theme";

export const PORTAL_THEME_CHANGE_EVENT = "rp-portal-theme-change";

export const PORTAL_THEME_ORDER: PortalThemeMode[] = ["dark", "light"];

export const PORTAL_THEME_LABEL: Record<PortalThemeMode, string> = {
  light: "Manhã",
  dark: "Noite",
};

export function isPortalThemeMode(value: string | null): value is PortalThemeMode {
  return value === "light" || value === "dark";
}

// Script anti-flash injetado logo no início de #portal-shell (ver app/(app)/layout.tsx),
// executado antes da hidratação. Ao contrário de THEME_INIT_SCRIPT (site, padrão claro — só
// ADICIONA "dark" quando preciso), aqui o padrão já É escuro: o SSR nunca marca a classe
// "portal-light", então o primeiro paint já nasce correto para a maioria; o script só entra
// para o caso raro de alguém ter escolhido Manhã explicitamente.
export const PORTAL_THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(PORTAL_THEME_KEY)});
    var el = document.getElementById("portal-shell");
    if (el && stored === "light") el.classList.add("portal-light");
  } catch (e) {}
})();
`;
