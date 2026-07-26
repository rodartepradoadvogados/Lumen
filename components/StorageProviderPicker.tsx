"use client";

import { useState, useTransition } from "react";
import { setStorageProvider } from "@/lib/actions/settings";
import { CheckCircle2 } from "lucide-react";

type Props = {
  current: string;
  isAdmin: boolean;
  oneDriveConnected: boolean;
};

const OPTIONS: { value: "GOOGLE_DRIVE" | "ONEDRIVE"; label: string }[] = [
  { value: "GOOGLE_DRIVE", label: "Google Drive" },
  { value: "ONEDRIVE", label: "OneDrive" },
];

// Ao contrário do EmailSendProviderPicker (preferência independente da conexão), aqui escolher
// "OneDrive" ANTES de conectar é permitido — a ordem natural é: escritório decide usar OneDrive →
// clica em conectar → OAuth. Por isso não bloqueamos o clique por "não conectado ainda", só
// avisamos.
export default function StorageProviderPicker({ current, isAdmin, oneDriveConnected }: Props) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(current);
  const [error, setError] = useState<string | null>(null);

  function choose(value: "GOOGLE_DRIVE" | "ONEDRIVE") {
    if (value === selected) return;
    setError(null);
    startTransition(async () => {
      const r = await setStorageProvider(value);
      if (r.error) setError(r.error);
      else setSelected(value);
    });
  }

  return (
    <div>
      <p className="text-xs font-semibold text-navy-900 dark:text-cream-50 mb-2">Armazenar anexos de Processos/Atendimentos/Assessoria em:</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending || !isAdmin}
              onClick={() => choose(opt.value)}
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
      {selected === "ONEDRIVE" && !oneDriveConnected && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
          OneDrive escolhido, mas ainda não conectado — conecte a conta abaixo para ativar de verdade. Até lá, uploads continuam falhando.
        </p>
      )}
      {error && <p className="text-[11px] text-red-600 dark:text-bordo-400 mt-2">{error}</p>}
    </div>
  );
}
