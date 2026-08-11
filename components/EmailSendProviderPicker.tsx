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
      <p className="text-xs font-semibold text-tx mb-2">Enviar e-mail do Atendimento por:</p>
      {/* Mesmo padrão do controle segmentado (DESIGN-SYSTEM.md §5): opção ativa inverte —
          fundo na cor do texto, texto na cor da superfície — sem cor de acento. */}
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
                isSelected ? "bg-tx text-sf" : "bg-sf-apoio text-tx-2"
              }`}
            >
              {isSelected && <CheckCircle2 size={13} />} {opt.label}
            </button>
          );
        })}
      </div>
      {!selected && (
        <p className="text-[11px] text-aviso mt-2">
          Nenhum provedor escolhido — o envio de e-mail no Atendimento está desabilitado até você escolher um acima.
        </p>
      )}
      {error && <p className="text-[11px] text-vinho mt-2">{error}</p>}
    </div>
  );
}
