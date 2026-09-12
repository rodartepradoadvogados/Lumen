// Mecanismo de tema do Painel da Empresa (app/painel-mestre/*) — Escuro / Claro, independente
// do tema do site (lib/theme.ts, "rp-site-theme"), do portal (lib/portalTheme.ts,
// "rp-portal-theme") e do PWA (components/mobile/MobileThemeToggle.tsx, "rp-mobile-theme"). Mesmo
// motivo que os outros já são independentes entre si: quem administra a plataforma pode preferir
// um tema aqui sem afetar os outros.
//
// Diferente do site (padrão "light") mas igual ao portal: padrão é "dark" — decisão registrada em
// .impeccable/plano-painel-mestre/andamento-painel-mestre.md e DESIGN.md ("Painel da Empresa").
// O Claro aqui não é o Manhã quase-branco do resto do produto — é uma versão deliberadamente mais
// fechada (".painel-mestre-light" em app/globals.css), pedido explícito do dono do projeto.
export type PainelMestreThemeMode = "light" | "dark";

export const PAINEL_MESTRE_THEME_KEY = "rp-painel-mestre-theme";

export const PAINEL_MESTRE_THEME_ORDER: PainelMestreThemeMode[] = ["dark", "light"];

export const PAINEL_MESTRE_THEME_LABEL: Record<PainelMestreThemeMode, string> = {
  light: "Claro",
  dark: "Escuro",
};

export function isPainelMestreThemeMode(value: string | null): value is PainelMestreThemeMode {
  return value === "light" || value === "dark";
}

// Script anti-flash injetado logo no início de #painel-mestre-shell (ver app/painel-mestre/
// layout.tsx), executado antes da hidratação. Padrão já é escuro (mesma lógica de
// PORTAL_THEME_INIT_SCRIPT): o SSR nunca marca "painel-mestre-light", então o primeiro paint já
// nasce correto pra maioria; o script só entra pro caso de alguém ter escolhido Claro
// explicitamente.
export const PAINEL_MESTRE_THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(PAINEL_MESTRE_THEME_KEY)});
    var el = document.getElementById("painel-mestre-shell");
    if (el && stored === "light") el.classList.add("painel-mestre-light");
  } catch (e) {}
})();
`;
