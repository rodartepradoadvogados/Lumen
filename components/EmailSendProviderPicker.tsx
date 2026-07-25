"use client";

import { useState, useTransition } from "react";
import { setEmailSendProvider } from "@/lib/actions/settings";
import { CheckCircle2 } from "lucide-react";

type Props = {
  current: string | null;
  googleConnected: boolean;
  microsoftConnected: boolean;
};

const OPTIONS: { value: "GOOGLE" | "MICROSOFT"; label: string }[] = [
  { value: "GOOGLE", label: "Google (Gmail)" },
  { value: "MICROSOFT", label: "Microsoft (Outlook)" },
];

// Conectar a conta não liga o envio sozinho — a pessoa precisa escolher explicitamente qual
// usar aqui. Só fica selecionável se a conta correspondente estiver conectada.
export default function EmailSendProviderPicker({ current, googleConnected, microsoftConnected }: Props) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(current);
  const [error, setError] = useState<string | null>(null);

  function choose(value: "GOOGLE" | "MICROSOFT" | null) {
    setError(null);
    startTransition(async () => {
      const r = await setEmailSendProvider(value);
      if (r.error) setError(r.error);
      else setSelected(value);
    });
  }

  const connected = { GOOGLE: googleConnected, MICROSOFT: microsoftConnected };

  return (
    <div>
      <p className="text-xs font-semibold text-navy-900 dark:text-cream-50 mb-2">Enviar e-mail do Atendimento por:</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const isConnected = connected[opt.value];
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending || !isConnected}
              onClick={() => choose(isSelected ? null : opt.value)}
              title={isConnected ? undefined : "Conecte esta conta primeiro"}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                isSelected
                  ? "bg-gold-600 dark:bg-gold-500 text-white"
                  : "bg-cream-100 dark:bg-white/10 text-navy-800/70 dark:text-cream-50/70"
              }`}
            >
              {isSelected && <CheckCircle2 size={13} />} {opt.label}
            </button>
          );
        })}
      </div>
      {!selected && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
          Nenhum provedor escolhido — o envio de e-mail no Atendimento está desabilitado até você escolher um acima.
        </p>
      )}
      {error && <p className="text-[11px] text-red-600 dark:text-bordo-400 mt-2">{error}</p>}
    </div>
  );
}
