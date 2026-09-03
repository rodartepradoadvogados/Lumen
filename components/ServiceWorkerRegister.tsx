"use client";

import { useEffect } from "react";

// Registra o service worker (public/sw.js) de forma passiva, sem pedir permissão de
// notificação — só o registro em si já é exigido pelo Chrome para considerar o site instalável
// (critério de PWA). No app mobile o registro só acontecia ao ativar notificações
// (components/mobile/NotificationPreferences.tsx), o que deixava a instalação dependente de uma
// ação que a maioria nunca toca; aqui, no desktop, registramos sozinho ao carregar a página.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
