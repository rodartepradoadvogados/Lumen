"use client";

import { useEffect, useRef, useState } from "react";
import { getUnreadPublicationsCount } from "@/lib/actions/publications";

// Mantém o número no ícone do PWA instalado (Badging API) em sincronia com as publicações/
// andamentos não lidos, para o usuário ver a contagem sem precisar abrir o app.
export default function AppBadgeSync({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const hasPinged = useRef(false);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    async function sync() {
      const current = await getUnreadPublicationsCount();
      setCount(current);
    }

    if (!hasPinged.current) {
      hasPinged.current = true;
      sync();
    }
    const interval = setInterval(sync, 60000);
    return () => clearInterval(interval);
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
