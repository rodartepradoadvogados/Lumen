"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateRecurringFee } from "@/lib/actions/financeiro";
import { formatCurrency } from "@/components/ui";
import { Repeat2, X } from "lucide-react";

// Card compacto pro honorário "até o arquivamento" ativo de um processo (Financeiro > lista de
// Contas a Receber) — mostra valor/dia de vencimento e permite encerrar antes do arquivamento
// (ex.: contrato renegociado). As parcelas já geradas continuam normalmente em Contas a Receber;
// só para de gerar as futuras (ver ensureRecurringFeeReceivables, lib/actions/financeiro.ts).
export default function RecurringFeeCard({ fee }: { fee: { id: string; description: string; amount: number; dueDay: number } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-marca-bg border-b border-regua">
      <span className="p-1.5 bg-marca-bg text-marca-tx shrink-0">
        <Repeat2 size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-tx">{fee.description}</p>
        <p className="text-xs text-tx-2">
          {formatCurrency(fee.amount)}/mês · vence dia {fee.dueDay} · até o arquivamento do processo
        </p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          if (!window.confirm(`Encerrar o honorário recorrente "${fee.description}"? As parcelas já lançadas continuam normalmente — só para de gerar as futuras.`)) return;
          setLoading(true);
          await deactivateRecurringFee(fee.id);
          router.refresh();
          setLoading(false);
        }}
        className="text-[11px] font-semibold text-tx-2 hover:text-atencao px-2 py-1 hover:bg-atencao/10 shrink-0 disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-1">
          <X size={12} /> Encerrar
        </span>
      </button>
    </div>
  );
}
