// Modo de visualização da casca do app desktop: Régua (rail + painel de seção, o modelo atual)
// ou Bancada (barra de guias + barra de menus + sub-abas, sem rail nem painel lateral) — ver
// DESIGN-SYSTEM.md §5 e components/ViewModeProvider.tsx (onde a preferência é lida/persistida).
//
// Mesmo padrão de persistência já usado por lib/theme.ts (THEME_KEY) e pelo
// PANEL_COLLAPSED_KEY de components/AppShell.tsx: chave própria em localStorage, migração
// nenhuma necessária (recurso novo, sem valor legado pra herdar).
export type ViewMode = "regua" | "bancada";

export const VIEW_MODE_KEY = "lumen:viewMode";

export const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  regua: "Régua",
  bancada: "Bancada",
};

export const VIEW_MODE_ORDER: ViewMode[] = ["regua", "bancada"];

export function isViewMode(value: string | null): value is ViewMode {
  return value === "regua" || value === "bancada";
}
