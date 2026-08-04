"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { pingSession } from "@/lib/actions/timesheet";

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}min`;
}

// Mostra o tempo decorrido da SESSÃO ATUAL (não o total do dia) — cada sessão nova (primeiro
// login do dia ou retomada após o aviso de inatividade) volta a contar visivelmente a partir de
// 0. É de propósito: o número zerando é o próprio sinal, tanto pra quem está usando quanto pra
// quem audita depois (Monitoramento da Equipe → Histórico, que lista os segmentos), de que houve
// uma pausa — antes o widget mostrava o total do dia, que praticamente não mudava ao voltar da
// inatividade (o tempo parado já não entrava na conta), dando a impressão de que nada tinha
// acontecido. O total do dia continua disponível pra quem audita, em Monitoramento da Equipe.
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
    // O aviso de inatividade manda o tempo da sessão nova (0, ou muito perto disso) junto com
    // o evento — aplicamos direto, sem esperar o próximo ping (até 25s depois), senão o widget
    // continua mostrando o número antigo por um tempo depois de já ter clicado em Continuar.
    function handleResume(e: Event) {
      pausedRef.current = false;
      const detail = (e as CustomEvent<{ sessionSeconds?: number }>).detail;
      setSeconds(typeof detail?.sessionSeconds === "number" ? detail.sessionSeconds : 0);
    }
    window.addEventListener("rp-timesheet-pause", handlePause);
    window.addEventListener("rp-timesheet-resume", handleResume);
    return () => {
      window.removeEventListener("rp-timesheet-pause", handlePause);
      window.removeEventListener("rp-timesheet-resume", handleResume);
    };
  }, []);

  useEffect(() => {
    // Enquanto pausado (aviso de inatividade na tela), o relógio visível também para —
    // senão ele continua subindo durante o bloqueio e mostra um tempo que não é real.
    const tick = setInterval(() => {
      if (pausedRef.current) return;
      setSeconds((s) => s + 1);
    }, 1000);

    async function ping() {
      if (pausedRef.current) return;
      const result = await pingSession();
      if ("sessionSeconds" in result) setSeconds(result.sessionSeconds);
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
    <span title="Tempo desta sessão (reinicia após um período de inatividade)" className="hidden lg:flex items-center gap-1 text-[11px] text-navy-800/40 dark:text-cream-50/40 font-medium tabular-nums">
      <Clock size={12} /> {formatHMS(seconds)}
    </span>
  );
}
