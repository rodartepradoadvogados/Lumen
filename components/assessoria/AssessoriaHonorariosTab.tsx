"use client";

import { useState, useTransition } from "react";
import { updateAssessoria, markHonorarioPaid, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Badge, formatCurrency, formatDate } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

const statusColors: Record<string, "green" | "amber" | "bordo" | "slate"> = {
  PENDENTE: "amber",
  PAGO: "green",
  ATRASADO: "bordo",
  PARCIAL: "amber",
  CANCELADO: "slate",
};
const statusLabels: Record<string, string> = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado", PARCIAL: "Parcial", CANCELADO: "Cancelado" };

export default function AssessoriaHonorariosTab({ assessoria }: { assessoria: Assessoria }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");

  const currentYear = new Date().getFullYear();
  const recebidoNoAno = assessoria.honorarios
    .filter((h) => h.receivable.status === "PAGO" && new Date(h.receivable.paidDate!).getFullYear() === currentYear)
    .reduce((sum, h) => sum + (h.receivable.paidAmount || 0), 0);
  const emAberto = assessoria.honorarios
    .filter((h) => h.receivable.status === "PENDENTE" || h.receivable.status === "ATRASADO" || h.receivable.status === "PARCIAL")
    .reduce((sum, h) => sum + Math.max(0, h.receivable.amount - (h.receivable.paidAmount || 0)), 0);

  function saveFee(formData: FormData) {
    startTransition(async () => {
      await updateAssessoria(assessoria.id, {
        monthlyFee: String(formData.get("monthlyFee") || ""),
        dueDay: String(formData.get("dueDay") || ""),
      });
      setEditing(false);
    });
  }

  function startPayHonorario(honorarioId: string, expectedAmount: number) {
    setPayingId(honorarioId);
    setPayAmount(String(expectedAmount));
    setPayDate(new Date().toISOString().slice(0, 10));
  }

  function confirmPayHonorario(honorarioId: string) {
    const amount = parseFloat(payAmount.replace(",", "."));
    if (!amount || amount <= 0 || !payDate) return;
    startTransition(async () => {
      await markHonorarioPaid(honorarioId, amount, payDate);
      setPayingId(null);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 p-3.5 rounded-lg border border-regua bg-sf">
        {editing ? (
          <form action={saveFee} className="flex items-center gap-2 flex-wrap">
            <MoneyInput name="monthlyFee" defaultValue={String(assessoria.monthlyFee)} className="w-32 border border-regua-forte bg-sf text-tx rounded-lg px-2.5 py-1.5 text-sm" />
            <span className="text-xs text-tx-2">/mês · vence dia</span>
            <input name="dueDay" type="number" min="1" max="28" defaultValue={assessoria.dueDay} className="w-16 border border-regua-forte bg-sf text-tx rounded-lg px-2.5 py-1.5 text-sm" />
            <button type="submit" disabled={pending} className="text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover px-3 py-1.5 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-tx-2">Cancelar</button>
          </form>
        ) : (
          <>
            <div>
              <b className="text-tx">{formatCurrency(assessoria.monthlyFee)}</b>{" "}
              <span className="text-tx-2 text-sm">por mês · vencimento todo dia {assessoria.dueDay}</span>
            </div>
            <button onClick={() => setEditing(true)} className="text-xs font-semibold text-tx">
              ✎ Editar valor/vencimento
            </button>
          </>
        )}
      </div>

      {assessoria.honorarios.length === 0 ? (
        <p className="text-sm text-tx-3 py-8 text-center">
          Nenhum honorário gerado ainda — o primeiro aparece automaticamente no início do próximo mês.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-tx-2 border-b border-regua">
                  <th className="pb-2 pr-3">Competência</th>
                  <th className="pb-2 pr-3">Valor</th>
                  <th className="pb-2 pr-3">Vencimento</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Pagamento</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {assessoria.honorarios.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 pr-3 font-medium text-tx">{h.competencia}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{formatCurrency(h.receivable.amount)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{formatDate(h.receivable.dueDate)}</td>
                    <td className="py-2.5 pr-3"><Badge color={statusColors[h.receivable.status] || "slate"}>{statusLabels[h.receivable.status] || h.receivable.status}</Badge></td>
                    <td className="py-2.5 pr-3 tabular-nums text-tx-2">{h.receivable.paidDate ? formatDate(h.receivable.paidDate) : "—"}</td>
                    <td className="py-2.5">
                      {h.receivable.status === "PENDENTE" || h.receivable.status === "ATRASADO" || h.receivable.status === "PARCIAL" ? (
                        payingId === h.id ? (
                          <div className="flex flex-col gap-1.5 py-1 min-w-[15rem]">
                            <div className="flex items-center gap-1.5">
                              <div>
                                <label className="block text-[10px] font-medium text-tx-2 mb-0.5">Data pgto.</label>
                                <input
                                  type="date"
                                  value={payDate}
                                  onChange={(e) => setPayDate(e.target.value)}
                                  className="w-32 text-xs border border-regua-forte bg-sf text-tx rounded-lg px-2 py-1"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-tx-2 mb-0.5">Valor pago (R$)</label>
                                <MoneyInput
                                  value={payAmount}
                                  onChange={setPayAmount}
                                  className="w-24 text-xs border border-regua-forte bg-sf text-tx rounded-lg px-2 py-1"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={pending}
                                onClick={() => confirmPayHonorario(h.id)}
                                className="text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover px-2.5 py-1 rounded-lg disabled:opacity-50"
                              >
                                {pending ? "Confirmando..." : "Confirmar"}
                              </button>
                              <button onClick={() => setPayingId(null)} className="text-xs text-tx-2">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => startPayHonorario(h.id, Math.max(0, h.receivable.amount - (h.receivable.paidAmount || 0)))} className="text-xs font-semibold text-acao hover:text-acao-hover">
                            Marcar como pago
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-tx-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-5 mt-3 text-sm text-tx-2">
            <span>Recebido no ano: <b className="text-tx tabular-nums">{formatCurrency(recebidoNoAno)}</b></span>
            <span>Em aberto: <b className="text-tx tabular-nums">{formatCurrency(emAberto)}</b></span>
          </div>
        </>
      )}
    </div>
  );
}
