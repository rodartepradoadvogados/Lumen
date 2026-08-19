"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, User, LogOut, X } from "lucide-react";
import { fetchTeamSummaries, fetchUserHistory } from "@/lib/actions/timesheet";
import ThemeToggle from "@/components/ThemeToggle";
import type { TeamSummary, DayHistory } from "@/lib/timesheet";

// Rótulo de bloco dentro do menu (DESIGN-SYSTEM.md §5): 9,5px caixa alta, tracking .11em, --tx-2.
// Usado pelo bloco "TEMA".
function MenuBlockLabel({ children }: { children: string }) {
  return <p className="px-2.5 pt-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[.11em] text-tx-2">{children}</p>;
}

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function TeamMonitorPanel({
  initials,
  name,
  role,
  photoUrl,
  isAdmin,
  logoutAction,
}: {
  initials: string;
  name: string;
  role: string;
  photoUrl?: string | null;
  isAdmin?: boolean;
  // Server Action de logout (lib/actions/auth.ts), passada por components/TopBar.tsx — o botão
  // "Sair" morava solto na TopBar como ícone; agora vive dentro deste menu (DESIGN-SYSTEM.md §5,
  // última posição, em --vinho). TopBar é Server Component e pode passar a Action direto como
  // prop para este Client Component; um <form action={...}> comum aqui dispara ela normalmente.
  logoutAction: () => Promise<void>;
}) {
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
    if (willOpen && isAdmin && !summaries) {
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
        <div className="h-8 w-8 rounded-full bg-grafite-800 text-marca flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="hidden md:block leading-tight text-left">
          <p className="text-sm font-medium text-tx flex items-center gap-1">
            {name} <ChevronDown size={12} className="text-tx-3" />
          </p>
          <p className="text-[11px] text-tx-2">{role}</p>
        </div>
      </button>

      {open && (
        <div className="solid-popover absolute right-0 top-full mt-2 w-96 max-w-[90vw] bg-sf rounded-xl border border-regua shadow-menu z-50 overflow-hidden">
          {/* Ordem do menu (DESIGN-SYSTEM.md §5): identificação → tema → Meu perfil → Sair
              (vinho, separado por régua). O bloco "Modo de visualização" saiu — Régua/Bancada
              não existem mais, ver components/AppShell.tsx e documento 02 do handoff. */}
          <div className="flex items-center gap-2.5 px-3 py-3 border-b border-regua">
            <div className="h-9 w-9 rounded-full bg-grafite-800 text-marca flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tx truncate">{name}</p>
              <p className="text-[11px] text-tx-2 truncate">{role}</p>
            </div>
          </div>

          <div className="border-b border-regua">
            <MenuBlockLabel>Tema</MenuBlockLabel>
            <div className="px-2.5 pb-2.5">
              <ThemeToggle variant="segmented" />
            </div>
          </div>

          <div className="p-1.5 border-b border-regua">
            <Link
              href="/perfil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-tx hover:bg-sf-apoio"
            >
              <User size={15} className="text-tx-2" /> Meu perfil
            </Link>
          </div>

          {/* Sair é ação destrutiva de sessão — vinho, nunca urgente (DESIGN-SYSTEM.md §2: vinho
              é da marca/ação destrutiva; urgente é dado, não se aplica aqui). */}
          <div className={clsx("p-1.5", isAdmin && "border-b border-regua")}>
            <form action={logoutAction}>
              <button
                type="submit"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-atencao hover:bg-atencao/10"
              >
                <LogOut size={15} /> Sair
              </button>
            </form>
          </div>

          {isAdmin && (
          <>
          <div className="flex items-center justify-between px-4 py-3 border-b border-regua">
            <h4 className="font-semibold text-tx text-sm">Monitoramento da Equipe</h4>
            <button onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {error && <p className="text-xs text-urgente p-4">{error}</p>}
            {!error && !summaries && <p className="text-xs text-tx-2 p-4">Carregando...</p>}
            {summaries?.map((s) => (
              <div key={s.id} className="border-b border-regua last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: s.color }}>
                    {s.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-tx">{s.name}</p>
                    <p className="text-[11px] text-tx-2">
                      Último login: {formatDateTime(s.lastLoginAt)} · Timesheet: {formatHMS(s.todaySeconds)}
                    </p>
                  </div>
                  <button onClick={() => toggleHistory(s.id)} className="flex items-center gap-0.5 text-[11px] font-semibold text-marca-tx hover:opacity-80 shrink-0">
                    Histórico
                    <ChevronDown size={12} className={`transition-transform ${expanded === s.id ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {expanded === s.id && (
                  <div className="bg-sf-apoio px-4 py-2">
                    {!history[s.id] && <p className="text-[11px] text-tx-3 py-1">Carregando histórico...</p>}
                    {history[s.id]?.length === 0 && <p className="text-[11px] text-tx-3 py-1">Sem registros recentes.</p>}
                    {history[s.id]?.map((h) => (
                      <div key={h.date} className="py-1.5 border-b border-regua last:border-0">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-tx-2">
                            {new Date(h.date + "T00:00:00").toLocaleDateString("pt-BR")} · primeiro login {formatTime(h.firstLogin)}
                          </span>
                          <span className="font-semibold text-tx">{formatHMS(h.seconds)}</span>
                        </div>
                        {/* Mais de um segmento no dia = sessão nova no meio do dia (voltou de
                            inatividade ou logou de novo), com uma pausa sem contar entre um
                            segmento e o outro — é o que permite enxergar se a pessoa ficou fora. */}
                        {h.sessions.length > 1 && (
                          <div className="mt-1 pl-2 border-l-2 border-regua space-y-0.5">
                            {h.sessions.map((seg, i) => (
                              <p key={i} className="text-[10px] text-tx-3 font-mono">
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
          </>
          )}
        </div>
      )}
    </div>
  );
}
