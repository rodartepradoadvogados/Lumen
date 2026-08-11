"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { VIEW_MODE_KEY, isViewMode, type ViewMode } from "@/lib/viewMode";

type ViewModeContextValue = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
};

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

// Troca de casca do app desktop (DESIGN-SYSTEM.md §5): Régua (rail + painel de seção) ou
// Bancada (guias + barra de menus + sub-abas) — components/AppShell.tsx lê `viewMode` daqui pra
// decidir qual conjunto montar, e o seletor dentro do menu do avatar (TeamMonitorPanel) escreve
// aqui. Precisa envolver TODA a árvore que decide/reage ao modo (AppShell inteiro), não só uma
// parte — por isso é Context, não estado local de um componente só.
//
// Padrão de persistência idêntico ao de ThemeToggle/lib/theme.ts: lê o localStorage só depois de
// montado (evita mismatch de hidratação, já que o servidor não sabe a preferência do navegador),
// e até lá assume o padrão "regua" — que é também o padrão de quem nunca escolheu nada.
export default function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>("regua");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (isViewMode(stored)) setViewModeState(stored);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue no padrão "regua".
    }
    setMounted(true);
  }, []);

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignora falha ao persistir; a escolha ainda vale para a sessão atual
    }
  }

  return (
    <ViewModeContext.Provider value={{ viewMode: mounted ? viewMode : "regua", setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

// Fora de um ViewModeProvider (não deveria acontecer em produção, mas protege contra uso
// precoce/isolado, ex.: testes de um componente sozinho) cai no padrão "regua" em vez de lançar,
// mesmo espírito do NOOP_TABS de components/TabsProvider.tsx.
export function useViewMode(): ViewModeContextValue {
  return useContext(ViewModeContext) ?? { viewMode: "regua", setViewMode: () => {} };
}
