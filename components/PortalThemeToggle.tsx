"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import {
  PORTAL_THEME_KEY,
  PORTAL_THEME_ORDER,
  PORTAL_THEME_LABEL,
  PORTAL_THEME_CHANGE_EVENT,
  isPortalThemeMode,
  type PortalThemeMode,
} from "@/lib/portalTheme";
import SegmentedControl from "@/components/SegmentedControl";

const ICONS: Record<PortalThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

// Irmão de components/ThemeToggle.tsx (site, THEME_KEY) e components/mobile/MobileThemeToggle.tsx
// (app mobile) — mesmo padrão, chave e nó de destino diferentes: aqui alterna a classe
// "portal-light" em #portal-shell (app/(app)/layout.tsx), não a classe "dark" em <html>. O
// script inline PORTAL_THEME_INIT_SCRIPT já aplica o estado certo antes deste componente
// montar (evita flash); a partir da hidratação, este componente assume o controle.
//
// Diferente do site (padrão "light"), o padrão aqui é "dark" — ver lib/portalTheme.ts e
// DESIGN.md, seção "Portal Noturno".
export default function PortalThemeToggle({ variant = "icon" }: { variant?: "icon" | "menu" | "segmented" }) {
  const [mode, setMode] = useState<PortalThemeMode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PORTAL_THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "dark".
    }
    setMode(isPortalThemeMode(stored) ? stored : "dark");
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.getElementById("portal-shell")?.classList.toggle("portal-light", mode === "light");
    window.dispatchEvent(new CustomEvent(PORTAL_THEME_CHANGE_EVENT, { detail: mode }));
  }, [mode, mounted]);

  function applyMode(next: PortalThemeMode) {
    setMode(next);
    try {
      localStorage.setItem(PORTAL_THEME_KEY, next);
    } catch {
      // ignora falha ao persistir; o toggle ainda funciona na sessão atual
    }
  }

  function cycle() {
    applyMode(PORTAL_THEME_ORDER[(PORTAL_THEME_ORDER.indexOf(mode) + 1) % PORTAL_THEME_ORDER.length]);
  }

  if (!mounted) {
    // Evita mismatch de hidratação até sabermos a preferência real; ocupa o mesmo espaço do botão.
    return <span className={variant === "icon" ? "h-9 w-9 shrink-0" : "block h-9"} aria-hidden="true" />;
  }

  const Icon = ICONS[mode];
  const nextLabel = PORTAL_THEME_LABEL[PORTAL_THEME_ORDER[(PORTAL_THEME_ORDER.indexOf(mode) + 1) % PORTAL_THEME_ORDER.length]];

  if (variant === "segmented") {
    return (
      <SegmentedControl
        ariaLabel="Tema do portal"
        value={mode}
        onChange={applyMode}
        options={PORTAL_THEME_ORDER.map((m) => ({ value: m, label: PORTAL_THEME_LABEL[m] }))}
      />
    );
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Tema atual: ${PORTAL_THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-tx hover:bg-sf-apoio"
      >
        <Icon size={15} className="text-tx-2" />
        Tema: {PORTAL_THEME_LABEL[mode]}
        <span className="ml-auto text-[11px] text-tx-3">Mudar p/ {nextLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      data-tip={`Tema: ${PORTAL_THEME_LABEL[mode]} (clique p/ ${nextLabel})`}
      data-tip-pos="bottom"
      aria-label={`Tema atual: ${PORTAL_THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
      className="p-2 hover:bg-sf-apoio transition-colors text-tx rounded-[2px]"
    >
      <Icon size={20} />
    </button>
  );
}
