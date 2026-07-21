"use client";

import { useEffect, useState } from "react";
import { Sun, CloudSun, Moon } from "lucide-react";
import { THEME_ORDER, THEME_LABEL, isThemeMode, type ThemeMode } from "@/lib/theme";

const MOBILE_THEME_KEY = "rp-mobile-theme";

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  auto: CloudSun,
  dark: Moon,
};

// Mesmos 3 estados do site (Dia/Tarde/Noite, ver lib/theme.ts), com chave de localStorage
// própria ("rp-mobile-theme") — o app mobile pode ficar num tema diferente do site sem um
// afetar o outro (ver comentário em app/m/layout.tsx). Alterna as classes `dark`/`theme-tarde`
// no <html>; o script inline em app/m/layout.tsx já aplica as classes certas antes deste
// componente montar (evita flash) — aqui só sincronizamos o estado visual do botão.
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
    document.documentElement.classList.toggle("dark", next === "dark" || next === "auto");
    document.documentElement.classList.toggle("theme-tarde", next === "auto");
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
      className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-cream-50/80 hover:text-gold-400 hover:bg-white/10 transition-colors"
    >
      <Icon size={16} />
    </button>
  );
}
