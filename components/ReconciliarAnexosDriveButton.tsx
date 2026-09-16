"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import DriveReconciliationModal from "@/components/DriveReconciliationModal";
import type { ReconciliationScope } from "@/lib/actions/attachmentReconciliation";

// Botão de escopo único — dentro de Processo/Caso, Atendimento, Licitação/Demanda (via
// AttachmentList.tsx) e Documentos gerais da Assessoria (AssessoriaDocumentosTab.tsx). Cada
// instância só reconcilia a PRÓPRIA pasta, ao contrário do botão "geral" de Gestão → Conexões
// (ReconciliarAnexosDriveGlobalButton.tsx), que varre o escritório inteiro.
export default function ReconciliarAnexosDriveButton({ scope, compact }: { scope: ReconciliationScope; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Confere o conteúdo real desta pasta no Google Drive contra os anexos já cadastrados"
        className={
          compact
            ? "flex items-center gap-1 text-etiqueta font-semibold text-tx-2 hover:text-tx px-2 py-1.5 rounded-md hover:bg-sf-apoio"
            : "inline-flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx border border-regua hover:border-regua-forte px-3 py-1.5 rounded-md bg-sf hover:bg-sf-apoio transition-colors"
        }
      >
        <RefreshCw size={compact ? 12 : 13} /> Reorganizar anexos do Drive
      </button>
      {open && <DriveReconciliationModal scope={scope} onClose={() => setOpen(false)} />}
    </>
  );
}
