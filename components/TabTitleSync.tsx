"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveTabLabel } from "@/lib/navItems";

// Vive só dentro do <iframe> de uma aba interna (AppShell.tsx só monta isso no branch "embed").
// A cada navegação — mesmo client-side, sem recarregar o iframe, ex: clicar num link interno da
// própria página — avisa a janela pai qual página está aberta agora, via postMessage, pra tira de
// abas nunca ficar presa ao rótulo de quando a aba foi aberta (o pedido era exatamente esse: a aba
// tem que sempre mostrar o nome da página que está de fato aberta nela).
export default function TabTitleSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabIdRef = useRef<string | null>(null);
  if (tabIdRef.current === null) {
    tabIdRef.current = searchParams.get("tabId");
  }

  useEffect(() => {
    const tabId = tabIdRef.current;
    if (!tabId || typeof window === "undefined" || window.self === window.top) return;
    const label = resolveTabLabel(pathname ?? "");
    if (!label) return;
    window.parent.postMessage({ source: "lumen-tab", tabId, label }, window.location.origin);
  }, [pathname]);

  return null;
}
