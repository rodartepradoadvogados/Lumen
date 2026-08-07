"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deactivateRecurringExpense } from "@/lib/actions/financeiro";
import { formatCurrency } from "@/components/ui";
import { Repeat2, X } from "lucide-react";

// Card compacto para uma despesa recorrente ativa (Financeiro > Contas a Pagar) — mostra
// valor/dia de vencimento e permite encerrar (ex.: contrato do advogado/estagiário terminou,
// cancelou a assinatura). As parcelas já geradas continuam normalmente em Contas a Pagar; só
// para de gerar as futuras (ver ensureRecurringExpensePayables, lib/actions/financeiro.ts).
// Mesmo desenho de RecurringFeeCard.tsx (Contas a Receber), do lado das Despesas — sem processo
// vinculado, ver RecurringExpense em prisma/schema.prisma.
export default function RecurringExpenseCard({ expense }: { expense: { id: string; description: string; amount: number; dueDay: number } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-gold-500/5 dark:bg-gold-400/10 border-b border-navy-800/5 dark:border-white/10">
      <span className="p-1.5 rounded-lg bg-gold-500/15 text-gold-700 dark:text-gold-400 shrink-0">
        <Repeat2 size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-navy-900 dark:text-cream-50">{expense.description}</p>
        <p className="text-xs text-navy-800/50 dark:text-cream-50/50">
          {formatCurrency(expense.amount)}/mês · vence dia {expense.dueDay} · sem data de fim
        </p>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          if (!window.confirm(`Encerrar a despesa recorrente "${expense.description}"? As parcelas já lançadas continuam normalmente — só para de gerar as futuras.`)) return;
          setLoading(true);
          await deactivateRecurringExpense(expense.id);
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
