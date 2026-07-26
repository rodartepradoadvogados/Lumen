"use client";

import { useState, useTransition } from "react";
import { setSupportAccessPolicy } from "@/lib/actions/supportAccess";
import { CheckCircle2 } from "lucide-react";

type Policy = "AUTO" | "APROVACAO";

const OPTIONS: { value: Policy; title: string; description: string }[] = [
  {
    value: "AUTO",
    title: "Automático",
    description: "O suporte entra na hora, sempre registrado e visível a vocês.",
  },
  {
    value: "APROVACAO",
    title: "Com aprovação",
    description: "Um sócio precisa liberar cada acesso antes dele acontecer.",
  },
];

// Mesmo padrão de components/EmailSendProviderPicker.tsx: Server Action de formulário disparada
// por useTransition, com estado otimista local (selected) só confirmado se a action não devolver
// erro. Só aparece pra isAdmin (checado na página, não aqui).
export default function SupportAccessPolicyPicker({ current }: { current: Policy }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Policy>(current);
  const [error, setError] = useState<string | null>(null);

  function choose(value: Policy) {
    if (value === selected) return;
    setError(null);
    startTransition(async () => {
      const r = await setSupportAccessPolicy(value);
      if (r.error) setError(r.error);
      else setSelected(value);
    });
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-3">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending}
              onClick={() => choose(opt.value)}
              className={`text-left rounded-lg border px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                isSelected
                  ? "border-gold-600 dark:border-gold-500 bg-gold-600/10 dark:bg-gold-500/10"
                  : "border-navy-800/15 dark:border-white/15 hover:border-navy-800/30 dark:hover:border-white/30"
              }`}
            >
              <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 flex items-center gap-1.5">
                {isSelected && <CheckCircle2 size={14} className="text-gold-600 dark:text-gold-400 shrink-0" />}
                {opt.title}
              </p>
              <p className="text-xs text-navy-800/60 dark:text-cream-50/60 mt-1">{opt.description}</p>
            </button>
          );
        })}
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-bordo-400 mt-2">{error}</p>}
    </div>
  );
}
