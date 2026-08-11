import type { ReactNode } from "react";

// Rótulo e cor do status financeiro (Payable/Receivable.status e o effectiveStatus derivado —
// ver lib/financeQuery.ts) — DESIGN-SYSTEM.md §10. A tabela é exata: nenhuma outra combinação
// fundo/texto vale para status financeiro.
//
// components/ui.tsx ainda não tinha um helper equivalente quando esta área foi migrada — por
// isso ele mora aqui em vez de lá. Se um helper de rótulo/cor de status financeiro aparecer em
// components/ui.tsx depois, os consumidores devem trocar para ele.
export type FinanceStatus = "PENDENTE" | "PAGO" | "ATRASADO" | "PARCIAL" | "CANCELADO" | "A_APURAR";

const financeStatusMeta: Record<string, { label: string; bg: string; text: string }> = {
  PENDENTE: { label: "Pendente", bg: "bg-aviso-bg", text: "text-aviso" },
  PAGO: { label: "Pago", bg: "bg-concluido-bg", text: "text-concluido" },
  ATRASADO: { label: "Atrasado", bg: "bg-urgente-bg", text: "text-urgente" },
  PARCIAL: { label: "Parcial", bg: "bg-aviso-bg", text: "text-aviso" },
  CANCELADO: { label: "Cancelado", bg: "bg-sf-apoio", text: "text-tx-3" },
  // Fora da tabela do §10 — status exclusivo de parcela de honorário "a apurar no desfecho do
  // processo" (Receivable.status, ver lib/financeQuery.ts). Sem valor real ainda, então segue o
  // mesmo neutro do Cancelado em vez de ganhar uma cor própria que o manual não define.
  A_APURAR: { label: "A apurar", bg: "bg-sf-apoio", text: "text-tx-3" },
};

// Rótulo capitalizado a mostrar (nunca o enum cru em caixa alta — era o bug em Despesas).
export function financeStatusLabel(status: string): string {
  return financeStatusMeta[status]?.label ?? status;
}

export function FinanceStatusBadge({ status, className = "" }: { status: string; className?: string }): ReactNode {
  const meta = financeStatusMeta[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${meta?.bg ?? "bg-sf-apoio"} ${meta?.text ?? "text-tx-3"} ${className}`}
    >
      {meta?.label ?? status}
    </span>
  );
}
