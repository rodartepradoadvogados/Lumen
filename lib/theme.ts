// Mecanismo de tema do site desktop (dia / tarde / noite).
//
// Diferente do app mobile (components/mobile/MobileThemeToggle.tsx, app/m/layout.tsx),
// que só tem 2 estados (claro/escuro) e persiste em "rp-mobile-theme", o site tem 3 estados:
// - "light" ("Dia"):  sempre claro, independente do sistema operacional.
// - "dark"  ("Noite"): sempre escuro, independente do sistema operacional.
// - "auto"  ("Tarde"): visual híbrido fixo (não segue mais o sistema operacional) — o fundo
//   da página fica claro, igual ao modo Dia, mas o resto (sidebar, cards, texto) permanece
//   estilizado como no modo Noite. Por baixo dos panos a classe `dark` continua sendo
//   aplicada ao <html> (para que todo o restante do app, que só conhece a variante Tailwind
//   `dark:`, continue se comportando como no modo Noite), e uma classe adicional
//   `theme-tarde` faz o fundo (app/globals.css, `.brand-texture`/`--background`) voltar a
//   ser claro só nesse modo.
//
// A chave de localStorage é separada da do mobile de propósito: são duas experiências
// diferentes e o dono do escritório pode querer, por exemplo, o site sempre no modo Noite
// mas o app mobile no automático, sem um afetar o outro.
export type ThemeMode = "light" | "dark" | "auto";

export const THEME_KEY = "rp-site-theme";

// Evento customizado disparado (window.dispatchEvent) sempre que o modo de tema muda —
// seja por clique no ThemeToggle, seja na sincronização inicial pós-montagem — para que
// outros componentes client (ex.: components/Sidebar.tsx) possam reagir ao modo EXATO
// escolhido ("light"/"auto"/"dark"), já que a classe `dark` do <html> só expõe um binário
// (escuro ou não). Mesmo padrão de eventos customizados já usado pelo timesheet
// (ver "rp-timesheet-pause"/"rp-timesheet-resume" em components/TimesheetTimer.tsx e
// components/InactivityNotice.tsx).
export const THEME_CHANGE_EVENT = "rp-site-theme-change";

export const THEME_ORDER: ThemeMode[] = ["light", "auto", "dark"];

export const THEME_LABEL: Record<ThemeMode, string> = {
  light: "Dia",
  auto: "Tarde",
  dark: "Noite",
};

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}

// "auto" (Tarde) sempre resolve escuro agora — o modo deixou de seguir o sistema
// operacional; é um terceiro visual fixo (ver comentário acima).
export function resolveIsDark(mode: ThemeMode): boolean {
  return mode === "dark" || mode === "auto";
}

// Script inline injetado no <body> do layout raiz (app/layout.tsx), executado antes da
// hidratação do React, para decidir se as classes `dark`/`theme-tarde` devem estar no <html>
// já no primeiro paint (evita o "flash" de tema errado). Mesmo padrão já usado em
// app/m/layout.tsx, adaptado para os 3 estados: "light" -> nunca escuro; "dark" -> sempre
// escuro; "auto" -> sempre escuro também (classe `dark`), mais a classe `theme-tarde` que
// deixa só o fundo da página claro. Sem preferência salva (primeira visita), o padrão é
// "light" (Dia) — "auto" (Tarde) já foi o padrão antes, mas confundia quem via o bordô do
// Tarde antes de conhecer o Noite (todo em azul-marinho) por trás do botão de tema.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var mode = stored === "light" || stored === "dark" || stored === "auto" ? stored : "light";
    var dark = mode === "dark" || mode === "auto";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("theme-tarde", mode === "auto");
  } catch (e) {}
})();
`;
