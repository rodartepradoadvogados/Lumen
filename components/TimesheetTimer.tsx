"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { pingSession } from "@/lib/actions/timesheet";

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}min`;
}

export default function TimesheetTimer({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const hasPinged = useRef(false);
  // Enquanto o aviso de inatividade (components/InactivityNotice.tsx) está na tela, o ping
  // fica pausado: não queremos que o tempo continue subindo silenciosamente enquanto a
  // pessoa não confirmou que voltou a prestar atenção.
  const pausedRef = useRef(false);

  useEffect(() => {
    function handlePause() {
      pausedRef.current = true;
    }
    function handleResume() {
      pausedRef.current = false;
    }
    window.addEventListener("rp-timesheet-pause", handlePause);
    window.addEventListener("rp-timesheet-resume", handleResume);
    return () => {
      window.removeEventListener("rp-timesheet-pause", handlePause);
      window.removeEventListener("rp-timesheet-resume", handleResume);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);

    async function ping() {
      if (pausedRef.current) return;
      const result = await pingSession();
      if ("todaySeconds" in result) setSeconds(result.todaySeconds);
    }
    if (!hasPinged.current) {
      hasPinged.current = true;
      ping();
    }
    const pingInterval = setInterval(ping, 25000);

    return () => {
      clearInterval(tick);
      clearInterval(pingInterval);
    };
  }, []);

  return (
    <span title="Tempo de sessão hoje" className="hidden lg:flex items-center gap-1 text-[11px] text-navy-800/40 dark:text-cream-50/40 font-medium tabular-nums">
      <Clock size={12} /> {formatHMS(seconds)}
    </span>
  );
}
