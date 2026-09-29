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
import { PORTAL_THEME_KEY } from "./portalTheme";

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

// COERÊNCIA COM O APP LOGADO (Capa, 29/09/2026). Antes a Capa tinha o próprio tema ("rp-site-theme",
// padrão Manhã) e o portal outro ("rp-portal-theme", padrão Noite): quem escolhia Noite na Capa
// entrava no app em Noite só por acaso, e quem escolhia Manhã entrava em Noite. Agora a escolha
// feita aqui VALE no app logado, porque salvarTema() grava as DUAS chaves, e a leitura dá
// prioridade à do portal (a última escolha feita dentro do app vale de volta na Capa).
//
// Sem nenhuma escolha salva, a Capa segue `prefers-color-scheme` (antes ignorava). O portal continua
// com padrão Noite (DESIGN.md, "Portal Noturno") e o app mobile tem chave própria, fora disto.
export function resolverTema(portal: string | null, site: string | null, sistemaEscuro: boolean): ThemeMode {
  const salvo = isThemeMode(portal) ? portal : site === "auto" ? "dark" : isThemeMode(site) ? site : null;
  if (salvo) return salvo;
  return sistemaEscuro ? "dark" : "light";
}

/** Tema efetivo no navegador: escolha salva (portal, depois site) ou o do sistema. Só no cliente. */
export function temaEfetivo(): ThemeMode {
  let portal: string | null = null;
  let site: string | null = null;
  try {
    portal = localStorage.getItem(PORTAL_THEME_KEY);
    site = localStorage.getItem(THEME_KEY);
  } catch {
    // localStorage indisponível (modo privado etc.): cai no tema do sistema.
  }
  const escuro = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolverTema(portal, site, escuro);
}

/** Grava a escolha nas duas chaves: a do site e a do portal (o app logado). */
export function salvarTema(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
    localStorage.setItem(PORTAL_THEME_KEY, mode);
  } catch {
    // ignora falha ao persistir; o alternador ainda funciona na sessão atual
  }
}

// Script inline injetado no <body> do layout raiz (app/layout.tsx), executado antes da
// hidratação do React, para decidir se a classe `dark` deve estar no <html> já no primeiro
// paint (evita o "flash" de tema errado). Mesma regra de resolverTema() acima, escrita em ES5
// porque roda como texto: chave do portal, depois a do site (uma preferência antiga "auto", do
// extinto modo Tarde, migra para "dark"), depois `prefers-color-scheme`.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var p = localStorage.getItem(${JSON.stringify(PORTAL_THEME_KEY)});
    var s = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var v = p === "light" || p === "dark" ? p : s === "auto" ? "dark" : s === "light" || s === "dark" ? s : null;
    var dark = v === null
      ? !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : v === "dark";
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;
