import Link from "next/link";
import { Building2, Lock } from "lucide-react";
import { formatCurrency } from "@/components/ui";
import { LumenStatusDot } from "@/components/painelMestre/LumenUi";
import type { TenantOfficeSummary } from "@/lib/actions/painelMestre";

// Uma linha da lista de escritórios — compartilhada entre o Cockpit (prévia dos 6 primeiros)
// e a página completa de Escritórios, pra não duplicar o JSX da linha em dois lugares.
const STATUS_LABEL: Record<string, string> = { ATIVA: "Em dia", SUSPENSA: "Bloqueado", CANCELADA: "Cancelado" };
const STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "slate"> = { ATIVA: "ok", SUSPENSA: "risk", CANCELADA: "slate" };

export default function OfficeListRow({ office }: { office: TenantOfficeSummary }) {
  return (
    <Link
      href={office.isInternal ? "#" : `/painel-mestre/${office.id}`}
      className={`flex items-center gap-3 px-5 py-3.5 ${office.isInternal ? "cursor-default" : "hover:bg-white/5"}`}
    >
      <span className="h-9 w-9 bg-white/5 text-white/80 flex items-center justify-center shrink-0">
        <Building2 size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{office.name}</p>
        <p className="text-[11px] text-white/45 font-mono tabular-nums">
          {office.isInternal ? "conta interna" : office.monthlyFee ? `${formatCurrency(office.monthlyFee)}/mês` : "sem plano cadastrado"}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60 whitespace-nowrap">
        <LumenStatusDot tone={office.isInternal ? "slate" : STATUS_TONE[office.status] ?? "slate"} />
        {office.isInternal ? "Interno" : STATUS_LABEL[office.status] ?? office.status}
      </span>
      {!office.isInternal && office.status === "SUSPENSA" && <Lock size={14} className="text-urgente" />}
    </Link>
  );
}
