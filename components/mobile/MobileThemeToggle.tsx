"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { THEME_ORDER, THEME_LABEL, isThemeMode, resolveIsDark, type ThemeMode } from "@/lib/theme";

const MOBILE_THEME_KEY = "rp-mobile-theme";

// O app mobile agora usa os mesmos 2 estados do site (Manhã/Noite — ver lib/theme.ts), mas
// mantém sua PRÓPRIA chave de localStorage ("rp-mobile-theme", não "rp-site-theme" de
// THEME_KEY): o dono do escritório pode querer, por exemplo, o site sempre em Noite mas o
// app mobile em Manhã, sem um afetar o outro — só o NÚMERO de estados que agora é igual.
// Até a remodelação do portal (2026-08), o app mobile tinha um terceiro estado próprio
// ("Tarde"/auto, ícone CloudSun) e classe `theme-tarde` no <html> — removidos junto com a
// versão "Tarde" do site (ver app/globals.css e app/m/layout.tsx).
const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

// Alterna a classe `dark` no <html>; o script inline em app/m/layout.tsx já aplica a classe
// certa antes deste componente montar (evita flash) — aqui só sincronizamos o estado visual
// do botão.
export default function MobileThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MOBILE_THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "light".
    }
    setMode(isThemeMode(stored) ? stored : "light");
    setMounted(true);
  }, []);

  function cycle() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
    setMode(next);
    document.documentElement.classList.toggle("dark", resolveIsDark(next));
    try {
      localStorage.setItem(MOBILE_THEME_KEY, next);
    } catch {
      // ignora falha ao persistir; o toggle ainda funciona na sessão atual
    }
  }

  if (!mounted) {
    // Evita mismatch de hidratação até sabermos a preferência real; ocupa o mesmo espaço do botão.
    return <span className="h-8 w-8 shrink-0" aria-hidden="true" />;
  }

  const Icon = ICONS[mode];
  const nextLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema atual: ${THEME_LABEL[mode]}. Toque para mudar para ${nextLabel}`}
      className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:text-marca hover:bg-white/10 transition-colors"
    >
      <Icon size={16} />
    </button>
  );
}
