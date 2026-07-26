"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchTeamSummaries, fetchUserHistory } from "@/lib/actions/timesheet";
import type { TeamSummary, DayHistory } from "@/lib/timesheet";

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}min`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")}, às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
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

  if (error) return <p className="text-xs text-bordo-600 dark:text-bordo-400 p-4">{error}</p>;
  if (!summaries) return <p className="text-xs text-navy-800/50 dark:text-cream-50/50 p-4">Carregando...</p>;

  return (
    <div className="divide-y divide-navy-800/5 dark:divide-white/10">
      {summaries.map((s) => (
        <div key={s.id}>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ backgroundColor: s.color }}>
              {s.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{s.name}</p>
              <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50">
                Último login: {formatDateTime(s.lastLoginAt)} · Timesheet: {formatHMS(s.todaySeconds)}
              </p>
            </div>
            <button onClick={() => toggleHistory(s.id)} className="flex items-center gap-0.5 text-[11px] font-semibold text-gold-700 dark:text-gold-400 shrink-0">
              Histórico
              <ChevronDown size={12} className={`transition-transform ${expanded === s.id ? "rotate-180" : ""}`} />
            </button>
          </div>
          {expanded === s.id && (
            <div className="bg-cream-50 dark:bg-white/5 px-4 py-2">
              {!history[s.id] && <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 py-1">Carregando histórico...</p>}
              {history[s.id]?.length === 0 && <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 py-1">Sem registros recentes.</p>}
              {history[s.id]?.map((h) => (
                <div key={h.date} className="flex justify-between text-[11px] py-1 border-b border-navy-800/5 dark:border-white/10 last:border-0">
                  <span className="text-navy-800/60 dark:text-cream-50/60">
                    {new Date(h.date + "T00:00:00").toLocaleDateString("pt-BR")} · primeiro login {new Date(h.firstLogin).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-semibold text-navy-900 dark:text-cream-50">{formatHMS(h.seconds)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
