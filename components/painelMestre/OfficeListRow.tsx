import Link from "next/link";
import { Building2, Lock, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import { formatCurrency } from "@/components/ui";
import { LumenStatusDot } from "@/components/painelMestre/LumenUi";
import type { TenantOfficeSummary } from "@/lib/actions/painelMestre";
import type { SaudeCobranca } from "@/lib/billingHealth";

// Uma linha da lista de escritórios — compartilhada entre o Cockpit (prévia dos 6 primeiros,
// sem `saude` calculada — não vale pagar a consulta extra ali) e a página completa de
// Escritórios (com `saude`, ver app/painel-mestre/escritorios/page.tsx), pra não duplicar o JSX
// da linha em dois lugares.
const STATUS_LABEL: Record<string, string> = { ATIVA: "Em dia", SUSPENSA: "Bloqueado", CANCELADA: "Cancelado" };
const STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "slate"> = { ATIVA: "ok", SUSPENSA: "risk", CANCELADA: "slate" };

const NIVEL_LABEL: Record<SaudeCobranca["nivel"], string> = {
  OK: "Cobrança OK",
  ATENCAO: "Atenção",
  PROBLEMA: "Problema",
  NAO_CONFIGURADA: "Não configurada",
};
const NIVEL_ICON: Record<SaudeCobranca["nivel"], typeof CheckCircle2> = {
  OK: CheckCircle2,
  ATENCAO: AlertTriangle,
  PROBLEMA: AlertCircle,
  NAO_CONFIGURADA: HelpCircle,
};
const NIVEL_TEXT_CLASS: Record<SaudeCobranca["nivel"], string> = {
  OK: "text-concluido",
  ATENCAO: "text-aviso",
  PROBLEMA: "text-urgente",
  NAO_CONFIGURADA: "text-tx-3",
};

export default function OfficeListRow({ office }: { office: TenantOfficeSummary & { saude?: SaudeCobranca | null } }) {
  const NivelIcon = office.saude ? NIVEL_ICON[office.saude.nivel] : null;
  return (
    <Link
      href={office.isInternal ? "#" : `/painel-mestre/${office.id}`}
      className={`flex items-center gap-3 px-5 py-3.5 ${office.isInternal ? "cursor-default" : "hover:bg-sf-apoio"}`}
    >
      <span className="h-9 w-9 rounded-sm bg-sf-apoio text-tx-2 flex items-center justify-center shrink-0">
        <Building2 size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tx truncate">{office.name}</p>
        <p className="text-etiqueta text-tx-3 font-mono tabular-nums">
          {office.isInternal ? "conta interna" : office.monthlyFee ? `${formatCurrency(office.monthlyFee)}/mês` : "sem plano cadastrado"}
        </p>
      </div>
      {/* Selo de saúde da cobrança — "bater o olho e saber se a cobrança está saudável, sem abrir
          cada escritório" (pedido original que criava a antiga página Assinaturas, ver
          lib/billingHealth.ts). Só aparece onde foi calculada (Escritórios); no Cockpit a linha
          fica só com o status de acesso de sempre. */}
      {office.saude && (
        <span className={`hidden sm:inline-flex items-center gap-1.5 text-etiqueta font-semibold whitespace-nowrap ${NIVEL_TEXT_CLASS[office.saude.nivel]}`}>
          {NivelIcon && <NivelIcon size={13} />}
          {NIVEL_LABEL[office.saude.nivel]}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 text-etiqueta font-semibold text-tx-2 whitespace-nowrap">
        <LumenStatusDot tone={office.isInternal ? "slate" : STATUS_TONE[office.status] ?? "slate"} />
        {office.isInternal ? "Interno" : STATUS_LABEL[office.status] ?? office.status}
      </span>
      {!office.isInternal && office.status === "SUSPENSA" && <Lock size={14} className="text-urgente" />}
    </Link>
  );
}
