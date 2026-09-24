"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import {
  PETICIONAMENTO_THEME_KEY,
  PETICIONAMENTO_THEME_ORDER,
  PETICIONAMENTO_THEME_LABEL,
  PETICIONAMENTO_THEME_CHANGE_EVENT,
  isPeticionamentoThemeMode,
  type PeticionamentoThemeMode,
} from "@/lib/peticionamentoTheme";

const ICONE: Record<PeticionamentoThemeMode, typeof Sun> = { light: Sun, dark: Moon };

/**
 * O BOTÃO DE TEMA DO PETICIONAMENTO — pedido do dono, 24/09/2026, item 3: "o botão de modo claro
 * e escuro sumiu do peticionamento".
 *
 * A CAUSA (não é uma regressão recente): esta aba é uma raiz de rota PRÓPRIA
 * (app/peticionamento/layout.tsx, fora de app/(app)/ — decisão do dono "sensação de sair do
 * Lúmen") — ela nunca renderizou o TopBar/TeamMonitorPanel do resto do produto, que é onde o
 * alternador do PORTAL mora (menu do avatar, components/PortalThemeToggle.tsx dentro de
 * components/TeamMonitorPanel.tsx). Repor ESSE botão aqui não funcionaria: ele alterna a classe
 * `portal-light` em `#portal-shell`, um nó que esta árvore nem renderiza.
 *
 * O que de fato faltava era ESTE componente: `.peticionamento[data-theme="light"]` já existe
 * inteiro em peticionamento.css desde o primeiro commit da aba (portado do mockup estático), mas
 * nenhum arquivo .tsx jamais colocou esse atributo em tela nenhuma — conferido no histórico
 * inteiro do git. Ou seja, o botão nunca "sumiu": ele nunca tinha sido escrito.
 *
 * Chave e evento próprios (lib/peticionamentoTheme.ts) — nunca lib/portalTheme.ts nem
 * lib/theme.ts: esta aba já tem paleta própria e independente ("Ardósia fria"), então o tema dela
 * não segue o do resto do Lúmen.
 */
export function AlternadorDeTema() {
  const [modo, setModo] = useState<PeticionamentoThemeMode>("dark");
  const [montado, setMontado] = useState(false);

  // Lê a preferência salva assim que monta (o script inline de app/peticionamento/layout.tsx já
  // aplicou o atributo real no <html>… aqui em #peticionamento-shell; isto só sincroniza o
  // ícone/estado do React).
  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(PETICIONAMENTO_THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "dark".
    }
    setModo(isPeticionamentoThemeMode(salvo) ? salvo : "dark");
    setMontado(true);
  }, []);

  useEffect(() => {
    if (!montado) return;
    const raiz = document.getElementById("peticionamento-shell");
    if (modo === "light") raiz?.setAttribute("data-theme", "light");
    else raiz?.removeAttribute("data-theme");
    window.dispatchEvent(new CustomEvent(PETICIONAMENTO_THEME_CHANGE_EVENT, { detail: modo }));
  }, [modo, montado]);

  function alternar() {
    const proximo = PETICIONAMENTO_THEME_ORDER[(PETICIONAMENTO_THEME_ORDER.indexOf(modo) + 1) % PETICIONAMENTO_THEME_ORDER.length];
    setModo(proximo);
    try {
      localStorage.setItem(PETICIONAMENTO_THEME_KEY, proximo);
    } catch {
      // ignora falha ao persistir; o alternador ainda funciona na sessão atual
    }
  }

  if (!montado) {
    // Evita mismatch de hidratação até sabermos a preferência real; ocupa o mesmo espaço do botão.
    return <span className="theme-toggle" style={{ visibility: "hidden" }} aria-hidden="true" />;
  }

  const Icone = ICONE[modo];
  const proximoRotulo = PETICIONAMENTO_THEME_LABEL[PETICIONAMENTO_THEME_ORDER[(PETICIONAMENTO_THEME_ORDER.indexOf(modo) + 1) % PETICIONAMENTO_THEME_ORDER.length]];

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={alternar}
      title={`Tema: ${PETICIONAMENTO_THEME_LABEL[modo]} (clique para mudar para ${proximoRotulo})`}
      aria-label={`Tema atual: ${PETICIONAMENTO_THEME_LABEL[modo]}. Clique para mudar para ${proximoRotulo}`}
    >
      <Icone size={13} aria-hidden="true" />
      {PETICIONAMENTO_THEME_LABEL[modo]}
    </button>
  );
}
