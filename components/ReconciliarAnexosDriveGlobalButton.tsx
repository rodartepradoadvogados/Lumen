"use client";

import { useState } from "react";
import { FolderSearch } from "lucide-react";
import DriveReconciliationModal from "@/components/DriveReconciliationModal";

// Botão "geral" de Gestão → Conexões → Manutenção — varre TODO processo/caso/atendimento/
// licitação/assessoria do escritório com pelo menos um anexo já cadastrado, agrupando as
// pendências por pasta. Complementar ao "Reorganizar anexos existentes no Drive"
// (ReorganizeAttachmentsButton.tsx), que só realoca registros já cadastrados para a pasta certa —
// nunca lê o conteúdo real de uma pasta, então nunca percebe arquivo substituído/novo direto no
// Drive. Complementar também aos botões de escopo único (ReconciliarAnexosDriveButton.tsx) dentro
// de cada pasta — mesma verificação, aqui rodada de uma vez só para o escritório inteiro.
export default function ReconciliarAnexosDriveGlobalButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit"
      >
        <FolderSearch size={16} /> Reconciliar anexos do Drive (todas as pastas)
      </button>
      {open && <DriveReconciliationModal scope="GLOBAL" onClose={() => setOpen(false)} />}
    </>
  );
}
