"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlarmClock } from "lucide-react";
import { resumeAfterInactivity } from "@/lib/actions/timesheet";
import { logout } from "@/lib/actions/auth";

// 15 minutos sem nenhuma interação (mouse, teclado, toque ou scroll) não faz mais logout —
// só mostra um aviso bloqueante. O timesheet (components/TimesheetTimer.tsx) é avisado via
// evento de window para parar de "pingar" enquanto o aviso está na tela, e ao confirmar
// "Continuar" abrimos uma sessão nova (resumeAfterInactivity) para que o tempo parado não
// seja contado como tempo de uso.
const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export default function InactivityNotice() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [idle, setIdle] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function handleInactivityTimeout() {
      setIdle(true);
      window.dispatchEvent(new CustomEvent("rp-timesheet-pause"));
    }

    function resetTimer() {
      // Enquanto o aviso estiver na tela, ignoramos qualquer atividade "casual" (mouse
      // passando por cima, etc.) — só o clique em "Continuar" (handleResume) tira o
      // estado de idle, pra garantir que a pessoa realmente confirmou que voltou.
      if (idle) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(handleInactivityTimeout, INACTIVITY_LIMIT_MS);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [idle]);

  function handleResume() {
    startTransition(async () => {
      const result = await resumeAfterInactivity();
      window.dispatchEvent(
        new CustomEvent("rp-timesheet-resume", {
          detail: "sessionSeconds" in result ? { sessionSeconds: result.sessionSeconds } : {},
        })
      );
      // A troca de idle para false reexecuta o efeito acima, que já reinicia a
      // contagem dos 15 minutos a partir de agora (resetTimer roda de novo).
      setIdle(false);
    });
  }

  if (!idle) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-grafite-900/70 flex items-center justify-center p-4">
      <div className="bg-sf shadow-pop w-full max-w-sm p-6 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-marca-bg text-marca-tx flex items-center justify-center">
          <AlarmClock size={24} />
        </div>
        <div className="space-y-1">
          <h3 className=" font-bold text-tx text-base">Você ficou inativo por um tempo</h3>
          <p className="text-sm text-tx-2">Deseja continuar de onde parou ou sair do sistema?</p>
        </div>
        <div className="flex gap-2">
          <form action={logout} className="flex-1">
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-sf-apoio hover:bg-sf-apoio text-tx font-semibold py-2.5 transition-colors disabled:opacity-50"
            >
              Sair
            </button>
          </form>
          <button
            onClick={handleResume}
            disabled={isPending}
            className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 transition-colors disabled:opacity-50"
          >
            {isPending ? "Retomando..." : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}
