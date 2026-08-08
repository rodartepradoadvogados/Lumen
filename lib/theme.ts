// Mecanismo de tema do site desktop (Manhã / Noite).
//
// Diferente do app mobile (components/mobile/MobileThemeToggle.tsx, app/m/layout.tsx),
// que persiste em "rp-mobile-theme", o site tem sua própria chave — o dono do escritório pode
// querer, por exemplo, o site sempre em Noite mas o app mobile no automático, sem um afetar
// o outro.
//
// Até a remodelação do portal (2026-08), existia um terceiro modo "auto" ("Tarde": fundo claro
// + resto da interface escuro) — removido por ser a origem de uma inconsistência visual
// recorrente (~80 regras de override em app/globals.css só pra sustentar esse híbrido).
// isThemeMode()/THEME_INIT_SCRIPT migram qualquer preferência salva como "auto" para "dark".
export type ThemeMode = "light" | "dark";

export const THEME_KEY = "rp-site-theme";

// Evento customizado disparado (window.dispatchEvent) sempre que o modo de tema muda —
// seja por clique no ThemeToggle, seja na sincronização inicial pós-montagem — para que
// outros componentes client possam reagir ao modo exato escolhido, já que a classe `dark` do
// <html> só expõe um binário (escuro ou não). Mesmo padrão de eventos customizados já usado
// pelo timesheet (ver "rp-timesheet-pause"/"rp-timesheet-resume" em
// components/TimesheetTimer.tsx e components/InactivityNotice.tsx).
export const THEME_CHANGE_EVENT = "rp-site-theme-change";

export const THEME_ORDER: ThemeMode[] = ["light", "dark"];

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Manhã",
  dark: "Noite",
};

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark";
}

// Script inline injetado no <body> do layout raiz (app/layout.tsx), executado antes da
// hidratação do React, para decidir se a classe `dark` deve estar no <html> já no primeiro
// paint (evita o "flash" de tema errado). Mesmo padrão já usado em app/m/layout.tsx. Uma
// preferência salva como "auto" (do extinto modo Tarde) migra para "dark". Sem preferência
// salva (primeira visita), o padrão é "light" (Manhã).
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var dark = stored === "dark" || stored === "auto";
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;
