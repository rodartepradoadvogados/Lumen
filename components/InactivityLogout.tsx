"use client";

import { useEffect, useRef, useTransition } from "react";
import { logout } from "@/lib/actions/auth";

// 15 minutos sem nenhuma interação (mouse, teclado, toque ou scroll) derruba a sessão.
// Isso também tem o efeito colateral desejado de "parar" o timesheet: como ninguém
// mais chama pingSession() depois do logout, a sessão de hoje simplesmente para de
// crescer, e uma nova sessão é aberta (por lib/timesheet.ts) no próximo login/ping.
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export default function InactivityLogout() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    function handleInactivityTimeout() {
      // logout() é uma server action que chama redirect("/login") — disparar dentro de
      // startTransition é o mesmo mecanismo que <form action={logout}> usa por baixo dos
      // panos, garantindo que o redirect seja tratado corretamente pelo client do Next.
      startTransition(async () => {
        await logout();
      });
    }

    function resetTimer() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(handleInactivityTimeout, INACTIVITY_LIMIT_MS);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [startTransition]);

  return null;
}
