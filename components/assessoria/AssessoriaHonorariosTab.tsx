"use client";

import { useState, useTransition } from "react";
import { updateAssessoria, markHonorarioPaid, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Badge, formatCurrency, formatDate } from "@/components/ui";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

const statusColors: Record<string, "green" | "amber" | "bordo" | "slate"> = {
  PENDENTE: "amber",
  PAGO: "green",
  ATRASADO: "bordo",
  CANCELADO: "slate",
};
const statusLabels: Record<string, string> = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado", CANCELADO: "Cancelado" };

export default function AssessoriaHonorariosTab({ assessoria }: { assessoria: Assessoria }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [payingId, setPayingId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const recebidoNoAno = assessoria.honorarios
    .filter((h) => h.receivable.status === "PAGO" && new Date(h.receivable.paidDate!).getFullYear() === currentYear)
    .reduce((sum, h) => sum + (h.receivable.paidAmount || 0), 0);
  const emAberto = assessoria.honorarios
    .filter((h) => h.receivable.status === "PENDENTE" || h.receivable.status === "ATRASADO")
    .reduce((sum, h) => sum + h.receivable.amount, 0);

  function saveFee(formData: FormData) {
    startTransition(async () => {
      await updateAssessoria(assessoria.id, {
        monthlyFee: String(formData.get("monthlyFee") || ""),
        dueDay: String(formData.get("dueDay") || ""),
      });
      setEditing(false);
    });
  }

  function payHonorario(honorarioId: string, amount: number) {
    const paidDate = new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      await markHonorarioPaid(honorarioId, amount, paidDate);
      setPayingId(null);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 p-3.5 rounded-lg border border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900">
        {editing ? (
          <form action={saveFee} className="flex items-center gap-2 flex-wrap">
            <input name="monthlyFee" type="number" step="0.01" defaultValue={assessoria.monthlyFee} className="w-32 border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5 text-sm" />
            <span className="text-xs text-navy-800/45 dark:text-cream-50/45">/mês · vence dia</span>
            <input name="dueDay" type="number" min="1" max="28" defaultValue={assessoria.dueDay} className="w-16 border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5 text-sm" />
            <button type="submit" disabled={pending} className="text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 px-3 py-1.5 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">Cancelar</button>
          </form>
        ) : (
          <>
            <div>
              <b className="text-navy-900 dark:text-cream-50">{formatCurrency(assessoria.monthlyFee)}</b>{" "}
              <span className="text-navy-800/45 dark:text-cream-50/45 text-sm">por mês · vencimento todo dia {assessoria.dueDay}</span>
            </div>
            <button onClick={() => setEditing(true)} className="text-xs font-semibold text-navy-900 dark:text-cream-50">
              ✎ Editar valor/vencimento
            </button>
          </>
        )}
      </div>

      {assessoria.honorarios.length === 0 ? (
        <p className="text-sm text-navy-800/40 dark:text-cream-50/40 py-8 text-center">
          Nenhum honorário gerado ainda — o primeiro aparece automaticamente no início do próximo mês.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 border-b border-navy-800/10 dark:border-white/10">
                  <th className="pb-2 pr-3">Competência</th>
                  <th className="pb-2 pr-3">Valor</th>
                  <th className="pb-2 pr-3">Vencimento</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Pagamento</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
                {assessoria.honorarios.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 pr-3 font-medium text-navy-900 dark:text-cream-50">{h.competencia}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-navy-800/70 dark:text-cream-50/70">{formatCurrency(h.receivable.amount)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-navy-800/70 dark:text-cream-50/70">{formatDate(h.receivable.dueDate)}</td>
                    <td className="py-2.5 pr-3"><Badge color={statusColors[h.receivable.status] || "slate"}>{statusLabels[h.receivable.status] || h.receivable.status}</Badge></td>
                    <td className="py-2.5 pr-3 tabular-nums text-navy-800/70 dark:text-cream-50/70">{h.receivable.paidDate ? formatDate(h.receivable.paidDate) : "—"}</td>
                    <td className="py-2.5">
                      {h.receivable.status === "PENDENTE" || h.receivable.status === "ATRASADO" ? (
                        payingId === h.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={pending}
                              onClick={() => payHonorario(h.id, h.receivable.amount)}
                              className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg disabled:opacity-50"
                            >
                              Confirmar
                            </button>
                            <button onClick={() => setPayingId(null)} className="text-xs text-navy-800/45 dark:text-cream-50/45">Cancelar</button>
                          </div>
                        ) : (
                          <button onClick={() => setPayingId(h.id)} className="text-xs font-semibold text-gold-700 dark:text-gold-400">
                            Marcar como pago
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-navy-800/40 dark:text-cream-50/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-5 mt-3 text-sm text-navy-800/70 dark:text-cream-50/70">
            <span>Recebido no ano: <b className="text-navy-900 dark:text-cream-50 tabular-nums">{formatCurrency(recebidoNoAno)}</b></span>
            <span>Em aberto: <b className="text-navy-900 dark:text-cream-50 tabular-nums">{formatCurrency(emAberto)}</b></span>
          </div>
        </>
      )}
    </div>
  );
}
