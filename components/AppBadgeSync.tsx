"use client";

import { useEffect, useRef, useState } from "react";
import { getUnreadAlertsCount } from "@/lib/actions/alerts";

// Mantém o número no ícone do PWA instalado (Badging API) em sincronia com o TOTAL de
// alertas pendentes do usuário — menções, prazos vencidos, tarefas delegadas, contas
// vencidas, publicações/andamentos não lidos etc. (ver lib/alerts.ts) — não só publicações,
// pra ele ver a contagem completa sem precisar abrir o app. Também escuta mensagens do
// service worker (public/sw.js): quando chega um push com o app em segundo plano, o SW avisa
// os clients abertos pra reconsultar na hora, em vez de esperar o polling de 60s.
export default function AppBadgeSync({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const hasPinged = useRef(false);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    async function sync() {
      const current = await getUnreadAlertsCount();
      setCount(current);
    }

    if (!hasPinged.current) {
      hasPinged.current = true;
      sync();
    }
    const interval = setInterval(sync, 60000);

    function onMessage(event: MessageEvent) {
      if (event.data?.type === "lumen-refresh-badge") sync();
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      clearInterval(interval);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [count]);

  return null;
}
