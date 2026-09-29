"use client";

import { useEffect } from "react";

// Registra o service worker de um PWA com o escopo dele. Fica na tela de entrada de cada app para
// que o app já seja instalável ANTES do login (o registro antes só acontecia dentro do app
// autenticado). O escopo do SW não tem barra final de propósito: precisa cobrir o start_url do
// manifesto ("/m", "/atendimento-app") — com "/m/" o start_url ficava fora do escopo.
export default function RegistrarServiceWorker({ script, escopo }: { script: string; escopo: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(script, { scope: escopo }).catch(() => {});
  }, [script, escopo]);
  return null;
}
