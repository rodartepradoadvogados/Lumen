import type { ReactNode } from "react";
import { Badge, financeStatusColors, financeStatusLabel } from "@/components/ui";

// Rótulo e cor do status financeiro (Payable/Receivable.status e o effectiveStatus derivado —
// ver lib/financeQuery.ts) — DESIGN-SYSTEM.md §10.
//
// A tabela fundo/texto/rótulo mora em components/ui.tsx (financeStatusLabels/financeStatusColors/
// financeStatusLabel) — esta área foi migrada antes desse helper existir lá, então tinha sua
// própria cópia. Consolidado: este arquivo agora só reexporta financeStatusLabel e oferece
// FinanceStatusBadge como um wrapper fino sobre <Badge> + financeStatusColors, para não haver
// duas fontes de verdade para o mesmo rótulo.
export type FinanceStatus = "PENDENTE" | "PAGO" | "ATRASADO" | "PARCIAL" | "CANCELADO" | "A_APURAR";

export { financeStatusLabel };

export function FinanceStatusBadge({ status, className }: { status: string; className?: string }): ReactNode {
  return (
    <Badge color={financeStatusColors[status] ?? "muted"} className={className}>
      {financeStatusLabel(status)}
    </Badge>
  );
}
