"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, formatDate } from "@/components/ui";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { deleteParecer, deleteDocumento, retryParecerDriveFolder } from "@/lib/actions/assessoria";
import MobileDocumentUpload from "@/components/mobile/MobileDocumentUpload";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";
import DriveFolderMissingNotice from "@/components/assessoria/DriveFolderMissingNotice";
import { Pencil, ExternalLink, Trash2 } from "lucide-react";

type ParecerDocumento = { id: string; name: string; docType: string; driveUrl: string; date: Date | string };

// Mesmo shape mínimo de components/assessoria/ParecerCard.tsx (site) — assessoria.pareceres (ver
// getAssessoriaDetail) sempre traz mais campos, TS aceita de boa (excesso de propriedade não é erro).
export type MobileParecerData = {
  id: string;
  name: string;
  date: Date | string;
  description: string | null;
  driveFolderId: string | null;
  documents: ParecerDocumento[];
};

export default function MobileParecerDetail({
  assessoriaId,
  parecer,
  storageConnected,
  storageMessage,
}: {
  assessoriaId: string;
  parecer: MobileParecerData;
  storageConnected: boolean;
  storageMessage?: string;
}) {
  const router = useRouter();
  const [docDeletingId, setDocDeletingId] = useState<string | null>(null);
  const [docDeleteError, setDocDeleteError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDeleteDoc(doc: ParecerDocumento) {
    if (!window.confirm(`Excluir o documento "${doc.name}"? Essa ação também remove o arquivo do armazenamento.`)) return;
    setDocDeleteError(null);
    setDocDeletingId(doc.id);
    startTransition(async () => {
      const result = await deleteDocumento(doc.id);
      setDocDeletingId(null);
      if (result.error) setDocDeleteError(result.error);
      else router.refresh();
    });
  }

  function handleDeleteParecer() {
    if (parecer.documents.length > 0) {
      setDeleteError("Esta demanda tem documentos dentro — remova-os antes de excluir a pasta.");
      return;
    }
    if (!window.confirm(`Excluir a demanda "${parecer.name}"?`)) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteParecer(parecer.id);
      if (result.error) setDeleteError(result.error);
      else router.push(`/m/assessoria/${assessoriaId}`);
    });
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold text-tx leading-tight">{parecer.name}</h1>
        <Link href={`/m/assessoria/${assessoriaId}/pareceres/${parecer.id}/editar`} className="flex items-center gap-1 text-corpo font-semibold text-tx-2 shrink-0 px-2 py-1 min-h-[44px]">
          <Pencil size={13} /> Editar
        </Link>
      </div>
      <p className="text-corpo text-tx-2 mt-0.5">{formatDate(parecer.date)}</p>

      <Card className="p-4 mt-3">
        <h2 className="font-bold text-tx text-sm mb-2">Dados da demanda</h2>
        {parecer.description ? (
          <p className="text-sm text-tx whitespace-pre-wrap">{parecer.description}</p>
        ) : (
          <p className="text-sm text-tx-3">Sem descrição.</p>
        )}
      </Card>

      {storageConnected && !parecer.driveFolderId && (
        <div className="mt-3">
          <DriveFolderMissingNotice
            message={`A demanda "${parecer.name}" ainda não tem pasta no armazenamento em nuvem.`}
            retry={retryParecerDriveFolder.bind(null, parecer.id)}
          />
        </div>
      )}

      <Card className="p-4 mt-3">
        <h2 className="font-bold text-tx text-sm mb-2">Documentos</h2>
        {parecer.documents.length === 0 ? (
          <p className="text-sm text-tx-3 mb-1">Nenhum documento dentro desta demanda ainda.</p>
        ) : (
          <div className="divide-y divide-regua">
            {parecer.documents.map((d) => {
              const Icon = getDocumentTypeIcon(d.docType);
              return (
                <div key={d.id} className="flex items-center gap-2.5 py-2.5">
                  <a href={d.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Icon size={15} className="shrink-0 text-tx-2" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-tx truncate">{d.name}</p>
                      <p className="text-corpo text-tx-2 mt-0.5">{getDocumentTypeLabel(d.docType)} · {formatDate(d.date)}</p>
                    </div>
                    <ExternalLink size={13} className="text-tx-3 shrink-0" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(d)}
                    disabled={docDeletingId === d.id}
                    className="p-1 text-tx-3 shrink-0 disabled:opacity-50"
                    aria-label="Excluir documento"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {docDeleteError && <p className="text-corpo text-urgente mt-1">{docDeleteError}</p>}
        {storageConnected ? <MobileDocumentUpload assessoriaId={assessoriaId} parecerId={parecer.id} /> : <StorageDisconnectedNotice message={storageMessage} />}
      </Card>

      <div className="mt-4 px-1">
        <button type="button" onClick={handleDeleteParecer} disabled={pending} className="flex items-center gap-1 text-corpo font-semibold text-tx-2 disabled:opacity-50">
          <Trash2 size={12} /> Excluir pasta
        </button>
        {deleteError && <p className="text-corpo text-urgente mt-1">{deleteError}</p>}
      </div>
    </>
  );
}
