"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecurringExpense } from "@/lib/actions/financeiro";
import RecurringExpenseCard from "@/components/RecurringExpenseCard";
import ContraparteField from "@/components/financeiro/ContraparteField";
import MoneyInput from "@/components/MoneyInput";
import { Plus, Repeat2 } from "lucide-react";

type Option = { id: string; name: string };
type RecurringExpense = { id: string; description: string; amount: number; dueDay: number };

// Lado a lado com o honorário mensal (receita) na aba Honorários da Assessoria — a mesma
// mecânica de despesa recorrente do Financeiro central (RecurringExpense, ver
// components/RecurringExpenseCard.tsx), só que já vinculada a esta assessoria de nascença, para
// eventualmente pagar mensalmente um parceiro/repasse dela (advogado associado, escritório
// parceiro etc.), sem precisar sair da tela da assessoria para o Financeiro para cadastrar.
export default function AssessoriaRecurringExpensesCard({
  assessoriaId,
  recurringExpenses,
  categories,
  costCenters,
  suppliers,
  teamMembers,
}: {
  assessoriaId: string;
  recurringExpenses: RecurringExpense[];
  categories: Option[];
  costCenters: Option[];
  suppliers: Option[];
  teamMembers: Option[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createRecurringExpense({
        description: String(formData.get("description") || ""),
        amount: String(formData.get("amount") || ""),
        dueDay: String(formData.get("dueDay") || ""),
        categoryId: String(formData.get("categoryId") || "") || undefined,
        costCenterId: String(formData.get("costCenterId") || "") || undefined,
        supplierId: String(formData.get("supplierId") || "") || undefined,
        payeeUserId: String(formData.get("payeeUserId") || "") || undefined,
        assessoriaId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="p-3.5 border border-regua bg-sf">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tx-2 mb-1 flex items-center gap-1.5">
        <Repeat2 size={12} className="text-marca-tx" /> Despesas recorrentes (repasse a parceiros)
      </p>

      {recurringExpenses.length === 0 && !adding && (
        <p className="text-xs text-tx-2 py-1">Nenhuma despesa recorrente vinculada a esta assessoria ainda.</p>
      )}

      {recurringExpenses.length > 0 && (
        <div className="-mx-3.5 border-t border-regua mt-1.5">
          {recurringExpenses.map((expense) => (
            <RecurringExpenseCard key={expense.id} expense={expense} />
          ))}
        </div>
      )}

      {adding ? (
        <form action={submit} className="mt-2.5 pt-2.5 border-t border-regua space-y-2.5">
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Descrição</label>
            <input
              type="text"
              name="description"
              required
              placeholder="Ex.: Repasse mensal — Dr. Fulano (advogado parceiro)"
              className="w-full border border-regua-forte bg-sf text-tx px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end gap-2.5 flex-wrap">
            <div>
              <label className="text-xs font-medium text-tx-2 block mb-1">Valor</label>
              <MoneyInput name="amount" className="w-32 border border-regua-forte bg-sf text-tx px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-tx-2 block mb-1">Dia do vencimento</label>
              <input
                type="number"
                name="dueDay"
                min={1}
                max={28}
                defaultValue={10}
                required
                className="w-20 border border-regua-forte bg-sf text-tx px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-tx-2 block mb-1">Categoria</label>
              <select name="categoryId" className="w-full border border-regua-forte bg-sf text-tx px-2.5 py-1.5 text-sm">
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-tx-2 block mb-1">Centro de Custo</label>
              <select name="costCenterId" className="w-full border border-regua-forte bg-sf text-tx px-2.5 py-1.5 text-sm">
                <option value="">Sem centro de custo</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ContraparteField suppliers={suppliers} teamMembers={teamMembers} />
          {error && <p className="text-xs text-urgente">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover px-3 py-1.5 disabled:opacity-50"
            >
              {pending ? "Salvando..." : "Salvar despesa recorrente"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs font-semibold text-tx-2">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover"
        >
          <Plus size={13} /> Nova despesa recorrente
        </button>
      )}
    </div>
  );
}
