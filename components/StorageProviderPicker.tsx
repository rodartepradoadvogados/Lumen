"use client";

import { useState, useTransition } from "react";
import { setStorageProvider } from "@/lib/actions/settings";
import { CheckCircle2 } from "lucide-react";

type Provider = "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX";

type Props = {
  current: string;
  isAdmin: boolean;
  oneDriveConnected: boolean;
  dropboxConnected: boolean;
};

const OPTIONS: { value: Provider; label: string }[] = [
  { value: "GOOGLE_DRIVE", label: "Google Drive" },
  { value: "ONEDRIVE", label: "OneDrive" },
  { value: "DROPBOX", label: "Dropbox" },
];

// Ao contrário do EmailSendProviderPicker (preferência independente da conexão), aqui escolher
// "OneDrive"/"Dropbox" ANTES de conectar é permitido — a ordem natural é: escritório decide usar
// o provedor → clica em conectar → OAuth. Por isso não bloqueamos o clique por "não conectado
// ainda", só avisamos (nunca para GOOGLE_DRIVE, que não tem conexão própria neste card).
export default function StorageProviderPicker({ current, isAdmin, oneDriveConnected, dropboxConnected }: Props) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(current);
  const [error, setError] = useState<string | null>(null);

  function choose(value: Provider) {
    if (value === selected) return;
    setError(null);
    startTransition(async () => {
      const r = await setStorageProvider(value);
      if (r.error) setError(r.error);
      else setSelected(value);
    });
  }

  const connectedByProvider: Partial<Record<Provider, boolean>> = {
    ONEDRIVE: oneDriveConnected,
    DROPBOX: dropboxConnected,
  };
  const selectedOption = OPTIONS.find((o) => o.value === selected);
  const needsConnection = selected !== "GOOGLE_DRIVE" && connectedByProvider[selected as Provider] === false;

  return (
    <div>
      <p className="text-xs font-semibold text-tx mb-2">Armazenar anexos de Processos/Atendimentos/Assessoria em:</p>
      {/* Mesmo padrão do controle segmentado (DESIGN-SYSTEM.md §5): opção ativa inverte —
          fundo na cor do texto, texto na cor da superfície — sem cor de acento. */}
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={pending || !isAdmin}
              onClick={() => choose(opt.value)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                isSelected ? "bg-tx text-sf" : "bg-sf-apoio text-tx-2"
              }`}
            >
              {isSelected && <CheckCircle2 size={13} />} {opt.label}
            </button>
          );
        })}
      </div>
      {needsConnection && (
        <p className="text-[11px] text-aviso mt-2">
          {selectedOption?.label} escolhido, mas ainda não conectado — conecte a conta abaixo para ativar de verdade. Até lá, uploads continuam falhando.
        </p>
      )}
      {error && <p className="text-[11px] text-vinho mt-2">{error}</p>}
    </div>
  );
}
