"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTabs } from "@/components/TabsProvider";

const DOUBLE_CLICK_WINDOW_MS = 250;

// Hook único por trás de "clique simples navega, duplo clique abre guia interna nova" — extraído
// da lógica que existia copiada em components/NavRail.tsx e components/PageSectionTabs.tsx, pra
// dar o mesmo comportamento a qualquer elemento clicável do app (ver components/TabLink.tsx),
// não só aos itens do rail/abas de seção.
//
// Dentro do <iframe> de uma guia já aberta (components/AppShell.tsx, branch `embed`), NÃO
// intercepta o clique: window.self !== window.top ali dentro, e um duplo clique num link do
// PRÓPRIO conteúdo da guia deve só navegar aquela guia normalmente — não tentar abrir uma guia
// nova (que, dentro do embed, nem existe TabsProvider de verdade acima, ver NOOP_TABS em
// TabsProvider.tsx).
export function useTabClick(href: string, label: string) {
  const router = useRouter();
  const { openTab, goToLiveView } = useTabs();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // abrir em nova aba do NAVEGADOR continua funcionando normal
      if (typeof window !== "undefined" && window.self !== window.top) return; // dentro de uma guia já aberta — navegação normal, sem duplo-clique-abre-guia recursivo

      e.preventDefault();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        openTab(href, label);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        goToLiveView();
        router.push(href);
      }, DOUBLE_CLICK_WINDOW_MS);
    },
    [href, label, openTab, goToLiveView, router]
  );
}
