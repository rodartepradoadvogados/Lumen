"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

// Aviso "esta assessoria/demanda ficou sem pasta no armazenamento" + ação de retentar — ver
// retryAssessoriaDriveFolder/retryParecerDriveFolder em lib/actions/assessoria.ts. Antes, uma
// falha na criação da pasta (Drive fora do ar, token expirado etc.) era engolida em silêncio: o
// registro "aparecia criado" normalmente e só quem soubesse checar Assessoria.driveFolderId no
// banco notava que faltava a pasta. Agora fica visível, com um jeito de corrigir sem recriar o
// registro inteiro.
export default function DriveFolderMissingNotice({
  message,
  retry,
}: {
  message: string;
  // Server action já vinculada ao id do registro (ver `.bind(null, id)` em quem usa este
  // componente) — só falta chamar.
  retry: () => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retry();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className=" border border-aviso/25 bg-aviso-bg rounded-md px-3 py-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 text-xs font-medium text-aviso">
          <AlertTriangle size={13} className="shrink-0" />
          {message}
        </span>
        <button
          type="button"
          onClick={handleRetry}
          disabled={pending}
          className="text-xs font-semibold text-aviso underline decoration-aviso/50 hover:decoration-aviso disabled:opacity-50 shrink-0"
        >
          {pending ? "Tentando..." : "Tentar criar pasta de novo"}
        </button>
      </div>
      {error && <p className="text-[11px] text-urgente mt-1">{error}</p>}
    </div>
  );
}
