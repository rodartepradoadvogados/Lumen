"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchTeamSummaries, fetchUserHistory } from "@/lib/actions/timesheet";
import type { TeamSummary, DayHistory } from "@/lib/timesheet";
import { horaDeBrasilia, dataDeBrasilia } from "@/lib/horaDeBrasilia";

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}min`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  return `${dataDeBrasilia(d)}, às ${horaDeBrasilia(d)}`;
}

function formatTime(iso: string) {
  return horaDeBrasilia(new Date(iso));
}

// Versão mobile de components/TeamMonitorPanel.tsx — mesmo dado (fetchTeamSummaries/
// fetchUserHistory), mas como bloco sempre visível na página (não um popover flutuante, ruim
// de usar em tela pequena).
export default function MobileTeamMonitor() {
  const [summaries, setSummaries] = useState<TeamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, DayHistory[]>>({});

  useEffect(() => {
    (async () => {
      const result = await fetchTeamSummaries();
      if ("error" in result) setError(result.error);
      else setSummaries(result);
    })();
  }, []);

  async function toggleHistory(userId: string) {
    if (expanded === userId) {
      setExpanded(null);
      return;
    }
    setExpanded(userId);
    if (!history[userId]) {
      const result = await fetchUserHistory(userId);
      if (!("error" in result)) setHistory((h) => ({ ...h, [userId]: result }));
    }
  }

  if (error) return <p className="text-corpo text-urgente p-4">{error}</p>;
  if (!summaries) return <p className="text-corpo text-tx-2 p-4">Carregando...</p>;

  return (
    <div className="divide-y divide-regua">
      {summaries.map((s) => (
        <div key={s.id}>
          <div className="flex items-center gap-3 px-4 py-3">
            {/* eslint-disable-next-line no-restricted-syntax -- Círculo com a cor escolhida pelo usuário (style inline). */}
            <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-corpo font-bold shrink-0" style={{ backgroundColor: s.color }}>
              {s.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-tx">{s.name}</p>
              <p className="text-corpo text-tx-2">
                Último login: {formatDateTime(s.lastLoginAt)} · Timesheet: {formatHMS(s.todaySeconds)}
              </p>
            </div>
            <button onClick={() => toggleHistory(s.id)} className="flex items-center gap-0.5 text-corpo font-semibold text-marca-tx shrink-0">
              Histórico
              <ChevronDown size={12} className={`transition-transform ${expanded === s.id ? "rotate-180" : ""}`} />
            </button>
          </div>
          {expanded === s.id && (
            <div className="bg-sf-apoio px-4 py-2">
              {!history[s.id] && <p className="text-corpo text-tx-2 py-1">Carregando histórico...</p>}
              {history[s.id]?.length === 0 && <p className="text-corpo text-tx-2 py-1">Sem registros recentes.</p>}
              {history[s.id]?.map((h) => (
                <div key={h.date} className="py-1.5 border-b border-regua last:border-0">
                  <div className="flex justify-between text-corpo">
                    <span className="text-tx-2">
                      {/* `h.date` é um DIA ("2026-09-19"), não um instante: ele já nasce com a meia-noite
                                local colada no fim para ser lido como o dia que é. Passá-lo pelo fuso do
                                escritório o deslocaria para o dia anterior em qualquer navegador a leste de
                                Brasília — trocaria um erro de três horas por um erro de um dia. */}
                            {new Date(h.date + "T00:00:00").toLocaleDateString("pt-BR")} · primeiro login {formatTime(h.firstLogin)}
                    </span>
                    <span className="font-semibold text-tx">{formatHMS(h.seconds)}</span>
                  </div>
                  {/* Mais de um segmento no dia = sessão nova no meio do dia (voltou de
                      inatividade ou logou de novo), com uma pausa sem contar entre um segmento
                      e o outro — é o que permite enxergar se a pessoa ficou fora. */}
                  {h.sessions.length > 1 && (
                    <div className="mt-1 pl-2 border-l-2 border-regua space-y-0.5">
                      {h.sessions.map((seg, i) => (
                        <p key={i} className="text-corpo text-tx-2 font-mono">
                          {formatTime(seg.loginAt)}–{formatTime(seg.lastPingAt)} ({formatHMS(seg.seconds)})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
