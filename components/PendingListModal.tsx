"use client";

import { useState, ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import clsx from "clsx";

// Card gerencial clicável do painel (documento 03 do handoff do redesenho Modernist, coluna
// estreita): filete de 2px no topo, rótulo 10px caixa alta/.12em/600 em --tx-2, valor grande —
// clicar abre uma janela suspensa com a listagem completa (contas a receber/pagar dos próximos 7
// dias, prazos atrasados). Reaproveitado pelos três cards para não duplicar a estrutura do modal;
// o conteúdo da lista é passado pronto pelo server component (page.tsx), que já tem os dados
// carregados. Não usa mais o StatCard genérico (usado só aqui antes) — a tipografia exata que o
// documento pede (34px prazos atrasados / 26px valores em R$) não bate com o StatCard padrão, que
// segue sendo usado direto em app/(app)/financeiro/page.tsx.
export default function PendingListModal({
  label,
  value,
  accentClassName = "border-t-regua-forte",
  valueClassName = "text-[26px] leading-none font-extrabold text-tx",
  title,
  icon: Icon,
  iconClassName,
  children,
}: {
  label: string;
  value: string;
  // Cor do filete de 2px no topo do card (ex.: "border-t-urgente" para Minhas Atrasadas).
  accentClassName?: string;
  // Tamanho/cor do valor (ex.: 34px em --urgente para contagem de atrasadas; 26px em --tx, sem
  // cor de urgência, para os dois valores em reais — DESIGN-SYSTEM, documento 03, tabela da
  // coluna estreita).
  valueClassName?: string;
  title: string;
  // Selo squircle do ícone (acabamento "premium", agosto/2026, sétima rodada) — opcional: sem
  // ícone, o card renderiza como antes (só rótulo + valor).
  icon?: LucideIcon;
  iconClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left w-full block">
        <div className={clsx("bg-sf border-t-2 rounded-lg p-5 h-full", accentClassName)}>
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span className={clsx("h-[30px] w-[30px] rounded-lg flex items-center justify-center shrink-0", iconClassName)}>
                <Icon size={15} strokeWidth={1.5} />
              </span>
            )}
            <p className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em]">{label}</p>
          </div>
          <p className={clsx("mt-2.5 tabular-nums", valueClassName)}>{value}</p>
        </div>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf shadow-pop w-full max-w-2xl max-h-[80vh] flex flex-col motion-safe:animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b-2 border-regua-forte shrink-0">
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
