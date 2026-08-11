"use client";

import { useState, ReactNode } from "react";
import { X } from "lucide-react";
import { StatCard } from "@/components/ui";

// Card gerencial clicável do painel: abre uma janela suspensa com a listagem completa
// (contas a receber/pagar pendentes, prazos atrasados). Reaproveitado pelos três cards
// para não duplicar a estrutura do modal; o conteúdo da lista é passado pronto pelo
// server component (page.tsx), que já tem os dados carregados.
export default function PendingListModal({
  label,
  value,
  hint,
  tone,
  icon,
  title,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "navy" | "gold" | "red" | "green";
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left w-full">
        <StatCard label={label} value={value} hint={hint} tone={tone} icon={icon} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf rounded-xl shadow-pop w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua shrink-0">
              <h3 className="font-bold text-tx">{title}</h3>
              <button onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto scrollbar-thin flex-1">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
