"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { endSupportAccessAsOffice } from "@/lib/actions/supportAccess";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function SupportAccessBannerClient({
  sessionId,
  memberName,
  reasonLabel,
  startedAtIso,
  expiresAtIso,
}: {
  sessionId: string;
  memberName: string;
  reasonLabel: string;
  startedAtIso: string;
  expiresAtIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const expiresAt = new Date(expiresAtIso).getTime();
  const [remaining, setRemaining] = useState(() => expiresAt - Date.now());

  // Contagem regressiva só de exibição — quem realmente decide se a sessão ainda vale é o
  // banco (getActiveSupportSession, checado a cada request). Ao zerar, só pedimos um refresh
  // pro servidor confirmar e a faixa some sozinha quando a sessão expirar de verdade lá.
  useEffect(() => {
    const id = setInterval(() => {
      const next = expiresAt - Date.now();
      setRemaining(next);
      if (next <= 0) {
        clearInterval(id);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, router]);

  const startedLabel = new Date(startedAtIso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    // `bg-atencao` (vinho) opaco e legível nos dois temas — mesmo raciocínio em
    // components/ActingOfficeBanner.tsx.
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-atencao text-white text-xs sm:text-sm font-semibold px-4 py-2 shrink-0 text-center">
      <ShieldAlert size={15} className="shrink-0" />
      <span>
        Suporte da Lúmen ativo: <strong>{memberName}</strong> entrou às {startedLabel} — motivo: {reasonLabel}.
      </span>
      <span className="font-mono tabular-nums">expira em {formatRemaining(remaining)}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await endSupportAccessAsOffice(sessionId);
            router.refresh();
          })
        }
        className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-0.5 text-xs disabled:opacity-50"
      >
        <X size={12} /> Encerrar agora
      </button>
    </div>
  );
}
