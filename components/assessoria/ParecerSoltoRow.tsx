"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderOpen, Loader2, Pencil, Trash2 } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import { formatDate } from "@/components/ui";
import { updateDocumento, deleteDocumento } from "@/lib/actions/assessoria";

export type ParecerSolto = { id: string; name: string; docType: string; driveUrl: string; date: Date | string };

// Uma demanda "solta" — um Parecer antigo, cadastrado ANTES de Parecer virar pasta (ver
// pareceresSoltos em AssessoriaProcessosCasosTab.tsx), que ainda não passou pelo backfill
// (scripts/backfill-pareceres.ts) e por isso não tem a linha completa de ParecerFolderRow (sem
// pasta, sem "dentro dela" pra expandir). Mesmo assim precisa poder ser renomeada — sem isso, uma
// demanda cadastrada antes da migração de pastas fica presa com o nome de quando foi criada.
export default function ParecerSoltoRow({ documento }: { documento: ParecerSolto }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();
  const [editDocType, setEditDocType] = useState(documento.docType);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function handleEdit(formData: FormData) {
    setEditError(null);
    startEditTransition(async () => {
      const result = await updateDocumento(documento.id, {
        name: String(formData.get("name") || ""),
        docType: editDocType,
        date: String(formData.get("date") || ""),
      });
      if (result.error) setEditError(result.error);
      else {
        setEditOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Excluir a demanda "${documento.name}"? Essa ação também remove o arquivo do armazenamento.`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteDocumento(documento.id);
      if (result.error) setDeleteError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="border border-regua overflow-hidden">
      <div className="flex justify-between items-center gap-3 py-2 px-3 text-sm">
        <a href={documento.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 min-w-0 flex-1 hover:underline">
          <FolderOpen size={14} className="shrink-0 text-tx-3" />
          <span className="font-medium text-tx truncate">{documento.name}</span>
          <span className="shrink-0 text-[10px] text-tx-3 font-mono">{getDocumentTypeLabel(documento.docType)}</span>
          <ExternalLink size={11} className="shrink-0 text-tx-3" />
        </a>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-tx-2 whitespace-nowrap text-xs">{formatDate(documento.date)}</span>
          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            title="Editar"
            className="p-1 text-tx-3 hover:text-tx"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deletePending}
            title="Excluir"
            className="p-1 text-tx-3 hover:text-atencao disabled:opacity-50"
          >
            {deletePending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </span>
      </div>
      {deleteError && <p className="px-3 pb-2 text-[11px] text-urgente">{deleteError}</p>}

      {editOpen && (
        <form action={handleEdit} className="px-3 pb-3 pt-1 border-t border-regua space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input name="name" required defaultValue={documento.name} placeholder="Nome da demanda" className="parecer-solto-edit-input" />
            <input name="date" type="date" defaultValue={new Date(documento.date).toISOString().slice(0, 10)} className="parecer-solto-edit-input" />
          </div>
          <DocumentTypeSelect value={editDocType} onChange={setEditDocType} className="parecer-solto-edit-input" allowCreate />
          {editError && <p className="text-xs text-urgente">{editError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={editPending}
              className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              {editPending ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setEditOpen(false)} className="text-xs font-semibold text-tx-2">
              Cancelar
            </button>
          </div>
          <style>{`.parecer-solto-edit-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.5rem; padding:0.4rem 0.65rem; font-size:0.75rem; background:var(--sf-superficie); color:var(--tx); }`}</style>
        </form>
      )}
    </div>
  );
}
