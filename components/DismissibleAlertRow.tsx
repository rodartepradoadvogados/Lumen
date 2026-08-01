"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dismissAlert } from "@/lib/actions/alerts";
import { Check } from "lucide-react";
import clsx from "clsx";

// Tipos de alerta sem nenhuma ação de "resolver" (ver lib/alerts.ts) ganham este botão "Lido" —
// clicar fica verdinho por um instante e depois esmorece a linha inteira antes de sumir de
// verdade. Repetido aqui (em vez de dentro de AlertRow) porque AlertRow decide entre <button>/
// <Link> para o clique principal — aninhar outro elemento interativo lá dentro quebraria o HTML
// (mesmo motivo do fix em ProcessNumberChip/AlertRow).
const DISMISSIBLE_ALERT_KINDS = new Set([
  "MENCAO",
  "FOLLOWUP_ATRASADO",
  "PARCELA_SEM_VENCIMENTO",
  "DRIVE_INCONSISTENCIA",
  "HONORARIO_APURAR_DECISAO",
  "HONORARIO_APURAR_PARADO",
]);

export default function DismissibleAlertRow({
  kind,
  entityId,
  rowClassName,
  children,
}: {
  kind: string;
  entityId?: string;
  rowClassName?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "marked" | "leaving">("idle");
  const dismissible = DISMISSIBLE_ALERT_KINDS.has(kind) && Boolean(entityId);

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!entityId || status !== "idle") return;
    setStatus("marked");
    setTimeout(() => setStatus("leaving"), 400);
    setTimeout(() => {
      dismissAlert(kind, entityId).then(() => router.refresh());
    }, 400 + 700);
  }

  return (
    <div
      className={clsx(
        "flex items-stretch transition-all duration-700 ease-in-out",
        rowClassName,
        status === "leaving" && "opacity-0 pointer-events-none"
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          disabled={status !== "idle"}
          className={clsx(
            "shrink-0 self-center mr-3 flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors",
            status === "idle" &&
              "text-navy-800/50 dark:text-cream-50/50 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/10",
            status !== "idle" && "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-400/15"
          )}
        >
          <Check size={12} /> Lido
        </button>
      )}
    </div>
  );
}
