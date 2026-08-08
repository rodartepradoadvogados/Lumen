"use client";

import { useEffect, useState } from "react";
import { Sun, CloudSun, Moon } from "lucide-react";

const MOBILE_THEME_KEY = "rp-mobile-theme";

// Estados próprios do app mobile (Dia/Tarde/Noite) — desacoplados de lib/theme.ts de propósito:
// o portal desktop reduziu seus temas a Manhã/Noite (ver lib/theme.ts), mas essa remodelação
// não muda o app mobile, que segue com os 3 estados originais e sua própria chave de
// localStorage ("rp-mobile-theme", não "rp-site-theme" — o dono do escritório pode querer um
// tema diferente em cada). O mecanismo de classes `dark`/`theme-tarde` continua o mesmo (ver
// app/globals.css, bloco `.dark.theme-tarde`, e o script inline em app/m/layout.tsx).
type MobileThemeMode = "light" | "dark" | "auto";
const MOBILE_THEME_ORDER: MobileThemeMode[] = ["light", "auto", "dark"];
const MOBILE_THEME_LABEL: Record<MobileThemeMode, string> = {
  light: "Dia",
  auto: "Tarde",
  dark: "Noite",
};
function isMobileThemeMode(value: string | null): value is MobileThemeMode {
  return value === "light" || value === "dark" || value === "auto";
}

const ICONS: Record<MobileThemeMode, typeof Sun> = {
  light: Sun,
  auto: CloudSun,
  dark: Moon,
};

// Alterna as classes `dark`/`theme-tarde` no <html>; o script inline em app/m/layout.tsx já
// aplica as classes certas antes deste componente montar (evita flash) — aqui só sincronizamos
// o estado visual do botão.
export default function MobileThemeToggle() {
  const [mode, setMode] = useState<MobileThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MOBILE_THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "light".
    }
    setMode(isMobileThemeMode(stored) ? stored : "light");
    setMounted(true);
  }, []);

  function cycle() {
    const next = MOBILE_THEME_ORDER[(MOBILE_THEME_ORDER.indexOf(mode) + 1) % MOBILE_THEME_ORDER.length];
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
  const nextLabel = MOBILE_THEME_LABEL[MOBILE_THEME_ORDER[(MOBILE_THEME_ORDER.indexOf(mode) + 1) % MOBILE_THEME_ORDER.length]];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema atual: ${MOBILE_THEME_LABEL[mode]}. Toque para mudar para ${nextLabel}`}
      className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-cream-50/80 hover:text-gold-400 hover:bg-white/10 transition-colors"
    >
      <Icon size={16} />
    </button>
  );
}
