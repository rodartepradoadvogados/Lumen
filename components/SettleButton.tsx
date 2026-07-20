"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reopenPayable, reopenReceivable } from "@/lib/actions/financeiro";
import SettleModal from "@/components/SettleModal";
import { Check, RotateCcw } from "lucide-react";

export default function SettleButton({
  id,
  kind,
  amount,
  status,
}: {
  id: string;
  kind: "payable" | "receivable";
  amount: number;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (status === "PAGO") {
    return (
      <button
        onClick={async () => {
          setLoading(true);
          await (kind === "payable" ? reopenPayable(id) : reopenReceivable(id));
          router.refresh();
          setLoading(false);
        }}
        disabled={loading}
        data-tip="Reabrir e desfazer a baixa"
        className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 hover:text-navy-900 px-2 py-1 rounded-lg hover:bg-cream-100"
      >
        <RotateCcw size={12} /> Reabrir
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-lg"
      >
        <Check size={12} /> Dar Baixa
      </button>
      {open && <SettleModal id={id} kind={kind} amount={amount} onClose={() => setOpen(false)} />}
    </>
  );
}
