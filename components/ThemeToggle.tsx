"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import {
  THEME_KEY,
  THEME_ORDER,
  THEME_LABEL,
  THEME_CHANGE_EVENT,
  isThemeMode,
  resolveIsDark,
  type ThemeMode,
} from "@/lib/theme";

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

// Botão único que alterna Manhã <-> Noite. O script inline em app/layout.tsx já aplica a
// classe certa antes deste componente montar (evita flash); aqui assumimos o controle a partir
// da hidratação, só para refletir o estado no ícone e reagir a cliques no próprio botão.
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  // Lê a preferência salva assim que monta (o valor real já foi aplicado no <html> pelo
  // script inline; aqui só sincronizamos o estado do React/ícone do botão). Sem preferência
  // salva, o padrão é "light" (Dia) — ver THEME_INIT_SCRIPT em lib/theme.ts.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "light".
    }
    setMode(isThemeMode(stored) ? stored : "light");
    setMounted(true);
  }, []);

  // Aplica o modo atual ao <html> (classe `dark`) e avisa o resto do app do modo escolhido via
  // evento customizado — dispara tanto na sincronização inicial pós-montagem quanto em toda
  // troca de modo pelo cycle().
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", resolveIsDark(mode));
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
  }, [mode, mounted]);

  function cycle() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
    setMode(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignora falha ao persistir; o toggle ainda funciona na sessão atual
    }
  }

  if (!mounted) {
    // Evita mismatch de hidratação até sabermos a preferência real; ocupa o mesmo espaço do botão.
    return <span className="h-9 w-9 shrink-0" aria-hidden="true" />;
  }

  const Icon = ICONS[mode];
  const nextLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]];

  return (
    <button
      type="button"
      onClick={cycle}
      data-tip={`Tema: ${THEME_LABEL[mode]} (clique p/ ${nextLabel})`}
      data-tip-pos="bottom"
      aria-label={`Tema atual: ${THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
      className="p-2 rounded-lg hover:bg-navy-900/5 dark:hover:bg-white/10 transition-colors text-navy-800 dark:text-cream-50/80"
    >
      <Icon size={20} />
    </button>
  );
}
