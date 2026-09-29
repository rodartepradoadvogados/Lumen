"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import {
  temaEfetivo,
  salvarTema,
  THEME_ORDER,
  THEME_LABEL,
  THEME_CHANGE_EVENT,
  resolveIsDark,
  type ThemeMode,
} from "@/lib/theme";
import SegmentedControl from "@/components/SegmentedControl";

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
};

// Botão único que alterna Manhã <-> Noite. O script inline em app/layout.tsx já aplica a
// classe certa antes deste componente montar (evita flash); aqui assumimos o controle a partir
// da hidratação, só para refletir o estado no ícone e reagir a cliques no próprio botão.
//
// variant="menu" (ver proposta de remodelação do portal: ThemeToggle sai da TopBar e entra no
// menu do avatar, components/TeamMonitorPanel.tsx) renderiza uma linha de menu com rótulo, em
// vez do botão-ícone isolado. variant="segmented" é o formato definitivo dentro do menu do
// avatar (DESIGN-SYSTEM.md §5): components/SegmentedControl.tsx com as opções Manhã/Noite — a
// lógica de leitura/persistência do tema continua só aqui, o controle segmentado só invoca
// setMode(). O app mobile tem seu próprio toggle, decoupled deste (ver
// components/mobile/MobileThemeToggle.tsx — 3 estados, Dia/Tarde/Noite, não 2).
export default function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "menu" | "segmented" | "cromo" | "capa" | "capaSeg" }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  // Lê a preferência assim que monta (o valor real já foi aplicado no <html> pelo script inline;
  // aqui só sincronizamos o estado do React/ícone do botão). Escolha salva (chave do portal, depois a
  // do site) ou `prefers-color-scheme` — ver lib/theme.ts.
  useEffect(() => {
    setMode(temaEfetivo());
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

  // Grava nas duas chaves: a escolha feita aqui vale também no app logado (lib/theme.ts).
  function applyMode(next: ThemeMode) {
    setMode(next);
    salvarTema(next);
  }

  function cycle() {
    applyMode(THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]);
  }

  if (!mounted) {
    // Evita mismatch de hidratação até sabermos a preferência real; ocupa o mesmo espaço do botão.
    return <span className={variant === "icon" || variant === "cromo" ? "block h-9 w-9 shrink-0" : variant === "capa" ? "block h-11 w-11 shrink-0" : variant === "capaSeg" ? "block min-h-[48px]" : "block h-9"} aria-hidden="true" />;
  }

  const Icon = ICONS[mode];
  const nextLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length]];

  if (variant === "segmented") {
    return (
      <SegmentedControl
        ariaLabel="Tema"
        value={mode}
        onChange={applyMode}
        options={THEME_ORDER.map((m) => ({ value: m, label: THEME_LABEL[m] }))}
      />
    );
  }

  // SOBRE CROMO — barra que NÃO retematiza (o cabeçalho do blog, o rail, o cabeçalho do PWA:
  // grafite fixo nos dois temas, DESIGN.md §3). A variante `icon` usa `text-tx`/`hover:bg-sf-apoio`,
  // que trocam com o tema: sobre um fundo que não troca, no Manhã o ícone sumiria. Aqui valem as
  // variantes criadas justamente para essa superfície — `rail-tx`, `rotulo`, `gaveta-fundo`.
  //
  // Acrescentada em 17/09/2026: o blog era a única superfície pública sem alternador. O tema
  // escuro sempre alcançou o blog (o script em app/layout.tsx aplica a classe em qualquer rota),
  // e a página de marketing já tinha a porta desde F5 — faltava esta.
  if (variant === "cromo") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Tema atual: ${THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
        className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-sm border border-gaveta-linha text-rail-tx hover:text-rotulo hover:bg-gaveta-fundo transition-colors duration-100 ease-out"
      >
        <Icon size={16} />
      </button>
    );
  }

  // Capa (homepage pública): botão-ícone de 44px, o alvo mínimo de toque.
  if (variant === "capa") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Tema atual: ${THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
        className="inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-[2px] text-tx hover:bg-acao-bg transition-colors duration-100 ease-out"
      >
        <Icon size={22} aria-hidden="true" />
      </button>
    );
  }

  // Capa, folha do menu do celular (abaixo de 640px o alternador sai da barra e mora aqui): duas
  // opções lado a lado, cada uma com 44px de altura e `aria-pressed`.
  if (variant === "capaSeg") {
    return (
      <div role="group" aria-label="Tema da página" className="grid grid-cols-2 border-2 border-regua-forte rounded-[2px]">
        {THEME_ORDER.map((m) => {
          const OptIcon = ICONS[m];
          const ativo = m === mode;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={ativo}
              onClick={() => applyMode(m)}
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] text-capa-mini font-semibold transition-colors duration-100 ease-out ${ativo ? "bg-acao text-acao-tx" : "text-tx hover:bg-acao-bg"}`}
            >
              <OptIcon size={18} aria-hidden="true" />
              {THEME_LABEL[m]}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={`Tema atual: ${THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-tx hover:bg-sf-apoio"
      >
        <Icon size={15} className="text-tx-2" />
        Tema: {THEME_LABEL[mode]}
        <span className="ml-auto text-etiqueta text-tx-3">Mudar p/ {nextLabel}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      data-tip={`Tema: ${THEME_LABEL[mode]} (clique p/ ${nextLabel})`}
      data-tip-pos="bottom"
      aria-label={`Tema atual: ${THEME_LABEL[mode]}. Clique para mudar para ${nextLabel}`}
      className="p-2 hover:bg-sf-apoio transition-colors text-tx rounded-md"
    >
      <Icon size={20} />
    </button>
  );
}
