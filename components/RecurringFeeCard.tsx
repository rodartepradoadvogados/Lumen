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
    <div className="flex items-center gap-3 px-5 py-3 bg-gold-500/5 dark:bg-gold-400/10 border-b border-navy-800/5 dark:border-white/10">
      <span className="p-1.5 rounded-lg bg-gold-500/15 text-gold-700 dark:text-gold-400 shrink-0">
        <Repeat2 size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-navy-900 dark:text-cream-50">{fee.description}</p>
        <p className="text-xs text-navy-800/50 dark:text-cream-50/50">
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
        className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-bordo-600 dark:hover:text-bordo-400 px-2 py-1 rounded-lg hover:bg-cream-100 dark:hover:bg-white/10 shrink-0 disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-1">
          <X size={12} /> Encerrar
        </span>
      </button>
    </div>
  );
}
