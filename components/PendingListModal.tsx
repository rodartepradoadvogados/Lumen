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
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">{title}</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
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
