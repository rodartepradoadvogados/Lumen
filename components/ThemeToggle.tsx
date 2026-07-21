"use client";

import { useEffect, useState } from "react";
import { Sun, CloudSun, Moon } from "lucide-react";
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
  auto: CloudSun,
  dark: Moon,
};

// Botão único que cicla Dia -> Tarde -> Noite -> Dia... na TopBar do site (ao lado de
// "Peticionar"). "Tarde" é o modo automático: segue window.matchMedia e reage a mudanças em
// tempo real enquanto estiver ativo (ex.: o SO muda de claro pra escuro ao anoitecer e o site
// acompanha sozinho, sem precisar recarregar a página). O script inline em app/layout.tsx já
// aplica a classe `dark` certa antes deste componente montar (evita flash); aqui assumimos o
// controle a partir da hidratação: refletimos o estado no ícone e reagimos a mudanças do SO.
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");
  const [mounted, setMounted] = useState(false);

  // Lê a preferência salva assim que monta (o valor real já foi aplicado no <html> pelo
  // script inline; aqui só sincronizamos o estado do React/ícone do botão).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "auto".
    }
    setMode(isThemeMode(stored) ? stored : "auto");
    setMounted(true);
  }, []);

  // Aplica o modo atual ao <html> e, quando em "auto", escuta mudanças do SO em tempo real.
  // Também avisa o resto do app (ex.: components/Sidebar.tsx) do modo EXATO escolhido via
  // evento customizado — dispara tanto na sincronização inicial pós-montagem quanto em toda
  // troca de modo pelo cycle() (já que ambas mexem em `mode` e reexecutam este efeito).
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", resolveIsDark(mode));
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
    if (mode !== "auto") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => document.documentElement.classList.toggle("dark", resolveIsDark("auto"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
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
