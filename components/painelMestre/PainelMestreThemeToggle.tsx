"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import {
  PAINEL_MESTRE_THEME_KEY,
  PAINEL_MESTRE_THEME_ORDER,
  PAINEL_MESTRE_THEME_LABEL,
  isPainelMestreThemeMode,
  type PainelMestreThemeMode,
} from "@/lib/painelMestreTheme";

const ICONS: Record<PainelMestreThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

// Irmão de PortalThemeToggle.tsx (portal) e components/mobile/MobileThemeToggle.tsx (PWA) —
// mesmo padrão, chave e nó de destino diferentes: alterna "painel-mestre-light" em
// #painel-mestre-shell (app/painel-mestre/layout.tsx). Estilo fixo branco/opacidade (não os
// tokens --tx/--sf-apoio) de propósito: este botão mora em LumenTopStrip, que continua grafite
// fixo nos dois temas (mesma regra do Rail/cabeçalho do PWA) — usar os tokens aqui renderizaria
// texto escuro sobre a barra escura sempre que o Claro estivesse ativo.
export default function PainelMestreThemeToggle() {
  const [mode, setMode] = useState<PainelMestreThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PAINEL_MESTRE_THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "dark".
    }
    setMode(isPainelMestreThemeMode(stored) ? stored : "dark");
    setMounted(true);
  }, []);

  function cycle() {
    const next = PAINEL_MESTRE_THEME_ORDER[(PAINEL_MESTRE_THEME_ORDER.indexOf(mode) + 1) % PAINEL_MESTRE_THEME_ORDER.length];
    setMode(next);
    document.getElementById("painel-mestre-shell")?.classList.toggle("painel-mestre-light", next === "light");
    try {
      localStorage.setItem(PAINEL_MESTRE_THEME_KEY, next);
    } catch {
      // ignora falha ao persistir; o toggle ainda funciona na sessão atual
    }
  }

  if (!mounted) {
    return <span className="h-8 w-8 shrink-0" aria-hidden="true" />;
  }

  const Icon = ICONS[mode];
  const nextLabel = PAINEL_MESTRE_THEME_LABEL[PAINEL_MESTRE_THEME_ORDER[(PAINEL_MESTRE_THEME_ORDER.indexOf(mode) + 1) % PAINEL_MESTRE_THEME_ORDER.length]];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema atual: ${PAINEL_MESTRE_THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
      className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-tx-2 hover:text-tx hover:bg-sf-apoio transition-colors"
    >
      <Icon size={16} />
    </button>
  );
}
