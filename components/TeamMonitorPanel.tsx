"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
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

export default function TeamMonitorPanel({ initials, name, role }: { initials: string; name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const [summaries, setSummaries] = useState<TeamSummary[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, DayHistory[]>>({});
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function handleOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !summaries) {
      const result = await fetchTeamSummaries();
      if ("error" in result) setError(result.error);
      else setSummaries(result);
    }
  }

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

  return (
    <div className="relative" ref={ref}>
      <button onClick={handleOpen} className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
        <div className="hidden md:block leading-tight text-left">
          <p className="text-sm font-medium text-navy-900 flex items-center gap-1">
            {name} <ChevronDown size={12} className="text-navy-800/40" />
          </p>
          <p className="text-[11px] text-navy-800/50">{role}</p>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-white rounded-xl border border-navy-800/10 shadow-pop z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800/8">
            <h4 className="font-serif font-bold text-navy-900 text-sm">Monitoramento da Equipe</h4>
            <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {error && <p className="text-xs text-red-700 p-4">{error}</p>}
            {!error && !summaries && <p className="text-xs text-navy-800/50 p-4">Carregando...</p>}
            {summaries?.map((s) => (
              <div key={s.id} className="border-b border-navy-800/5 last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: s.color }}>
                    {s.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-900">{s.name}</p>
                    <p className="text-[11px] text-navy-800/50">
                      Último login: {formatDateTime(s.lastLoginAt)} · Timesheet: {formatHMS(s.todaySeconds)}
                    </p>
                  </div>
                  <button onClick={() => toggleHistory(s.id)} className="flex items-center gap-0.5 text-[11px] font-semibold text-gold-700 hover:text-gold-900 shrink-0">
                    Histórico
                    <ChevronDown size={12} className={`transition-transform ${expanded === s.id ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {expanded === s.id && (
                  <div className="bg-cream-50 px-4 py-2">
                    {!history[s.id] && <p className="text-[11px] text-navy-800/40 py-1">Carregando histórico...</p>}
                    {history[s.id]?.length === 0 && <p className="text-[11px] text-navy-800/40 py-1">Sem registros recentes.</p>}
                    {history[s.id]?.map((h) => (
                      <div key={h.date} className="flex justify-between text-[11px] py-1 border-b border-navy-800/5 last:border-0">
                        <span className="text-navy-800/60">
                          {new Date(h.date + "T00:00:00").toLocaleDateString("pt-BR")} · primeiro login {new Date(h.firstLogin).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="font-semibold text-navy-900">{formatHMS(h.seconds)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
