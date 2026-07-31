"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reopenPayable, reopenReceivable } from "@/lib/actions/financeiro";
import SettleModal from "@/components/SettleModal";
import { Check, RotateCcw } from "lucide-react";

type Option = { id: string; name: string };

// PARCIAL (Fase 3) mostra os DOIS botões: "Dar Baixa" para lançar outro pagamento (que pode
// zerar o saldo ou deixar ainda mais parcial) e "Reabrir" para apagar TODOS os FinancePayment já
// lançados e voltar a PENDENTE — ver lib/actions/financeiro.ts:reopenPayable/reopenReceivable.
// PAGO só mostra "Reabrir"; PENDENTE/ATRASADO só mostram "Dar Baixa".
export default function SettleButton({
  id,
  kind,
  liquido,
  alreadyPaid,
  status,
  bankAccounts,
}: {
  id: string;
  kind: "payable" | "receivable";
  liquido: number;
  alreadyPaid: number;
  status: string;
  bankAccounts: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isPago = status === "PAGO";
  const isParcial = status === "PARCIAL";

  return (
    <div className="flex items-center gap-1">
      {(isPago || isParcial) && (
        <button
          onClick={async () => {
            setLoading(true);
            await (kind === "payable" ? reopenPayable(id) : reopenReceivable(id));
            router.refresh();
            setLoading(false);
          }}
          disabled={loading}
          data-tip={isParcial ? "Reabrir e apagar os pagamentos parciais já lançados" : "Reabrir e desfazer a baixa"}
          className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2 py-1 rounded-lg hover:bg-cream-100 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <RotateCcw size={12} /> Reabrir
        </button>
      )}
      {!isPago && (
        <>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg"
          >
            <Check size={12} /> Dar Baixa
          </button>
          {open && (
            <SettleModal id={id} kind={kind} liquido={liquido} alreadyPaid={alreadyPaid} bankAccounts={bankAccounts} onClose={() => setOpen(false)} />
          )}
        </>
      )}
    </div>
  );
}
