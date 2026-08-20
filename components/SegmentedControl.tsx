"use client";

import clsx from "clsx";

export type SegmentedOption<T extends string> = { value: T; label: string };

// Controle segmentado reutilizável (DESIGN-SYSTEM.md §5) — usado por TEMA (Manhã/Noite,
// components/ThemeToggle.tsx) e por MODO DE VISUALIZAÇÃO (Régua/Bancada,
// components/TeamMonitorPanel.tsx), os dois dentro do menu do avatar. Propositalmente sem
// nenhuma cor de acento: a opção ativa apenas INVERTE (fundo na cor do texto, texto na cor da
// superfície) — o ouro/azul de ação fica reservado ao produto, não ao seletor de preferência.
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex items-center gap-0.5 p-0.5 border border-regua bg-sf-apoio">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "flex-1 h-6 flex items-center justify-center rounded text-[11px] transition-colors",
              active ? "bg-tx text-sf font-semibold" : "bg-transparent text-tx-2 font-medium hover:text-tx"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
