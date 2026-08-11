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
                // Mesmo padrão do controle segmentado (DESIGN-SYSTEM.md §5): opção ativa inverte,
                // sem cor de acento — ver components/EmailSendProviderPicker.tsx.
                isSelected ? "border-tx bg-tx" : "border-regua hover:border-regua"
              }`}
            >
              <p className={`text-sm font-semibold flex items-center gap-1.5 ${isSelected ? "text-sf" : "text-tx"}`}>
                {isSelected && <CheckCircle2 size={14} className="text-sf shrink-0" />}
                {opt.title}
              </p>
              <p className={`text-xs mt-1 ${isSelected ? "text-sf/70" : "text-tx-2"}`}>{opt.description}</p>
            </button>
          );
        })}
      </div>
      {error && <p className="text-[11px] text-urgente mt-2">{error}</p>}
    </div>
  );
}
