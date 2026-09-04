"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Movimento 1 · deslizar — proposta de design "Movimento & Prazos" (setembro/2026). Painel
// lateral que desliza da direita (24px + fade, 160ms — ver .animate-drawer-in em
// app/globals.css), para gavetas e painéis de detalhe rápido (ex.: "ficha do processo").
//
// Deliberadamente NÃO aplicado a nenhum modal existente nesta entrega: TaskDetailModal,
// NewPayableModal e afins já usam ModalShell (components/ModalShell.tsx) e funcionam bem —
// trocar a casca deles por esta é uma decisão de redesenho à parte, não "completar o que falta".
// Este componente fica pronto para o próximo painel lateral que for construído do zero.
export default function SlideDrawer({
  title,
  subtitle,
  onClose,
  children,
  widthClassName = "w-[86vw] sm:w-96",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}) {
  useEscapeToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 animate-fade-in" onClick={onClose}>
      <div
        className={`absolute inset-y-0 right-0 ${widthClassName} bg-sf shadow-pop flex flex-col overflow-hidden animate-drawer-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b-2 border-regua-forte">
          <div className="min-w-0">
            <h3 className="font-bold text-tx truncate">{title}</h3>
            {subtitle && <p className="text-xs text-tx-2 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
