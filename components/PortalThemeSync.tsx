"use client";

import { useEffect } from "react";
import { PORTAL_THEME_KEY } from "@/lib/portalTheme";

// Aplica a escolha de tema salva ao #portal-shell DEPOIS de uma navegação no cliente.
//
// O anti-flash de PORTAL_THEME_INIT_SCRIPT é um <script> em texto dentro do layout do portal: ele
// roda quando o HTML vem do servidor, mas NÃO quando o React monta o layout numa navegação do
// cliente. Foi o que a Capa expôs: quem escolhia Manhã na Capa e entrava pelo /login (ação de
// servidor + redirect, sem recarregar) caía no app em Noite, porque o script nunca rodava — a
// escolha só valia depois de um F5. Este efeito cobre esse caminho; no carregamento completo o
// script continua sendo quem evita o flash.
export default function PortalThemeSync() {
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(PORTAL_THEME_KEY);
      const el = document.getElementById("portal-shell");
      if (el && (salvo === "light" || salvo === "dark")) el.classList.toggle("portal-light", salvo === "light");
    } catch {
      // localStorage indisponível: o portal segue com o padrão (Noite).
    }
  }, []);
  return null;
}
