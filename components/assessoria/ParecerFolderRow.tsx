"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ChevronDown, ChevronRight, ExternalLink, FolderOpen, Loader2, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { formatDate } from "@/components/ui";
import { updateParecer, deleteParecer } from "@/lib/actions/assessoria";

type ParecerDocumento = { id: string; name: string; docType: string; driveUrl: string; date: Date | string };

// Formato mínimo que este componente precisa — assessoria.pareceres (ver getAssessoriaDetail em
// lib/actions/assessoria.ts) sempre traz mais campos que isso, mas TS aceita de boa (não é um
// literal, é uma variável — excesso de propriedade não é erro).
export type ParecerData = {
  id: string;
  name: string;
  date: Date | string;
  description: string | null;
  documents: ParecerDocumento[];
};

// Um arquivo ainda não enviado, aguardando confirmação (nome + categoria) — mesmo espírito de
// StagedItem em components/NewCaseAttachmentsField.tsx. Também passa pelo Vercel Blob antes de
// chegar no servidor (ver enviarTodos abaixo) — o Parecer já existe no momento do upload, mas o
// arquivo pode ser grande (processo digitalizado inteiro, por exemplo), e uma Vercel Serverless
// Function tem limite de payload de entrada bem menor que isso.
type StagedItem = { tempId: string; file: File; name: string; docType: string; uploading: boolean; error?: string };

// Uma linha "pasta" de Parecer na aba Pareceres/Processos/Casos da Assessoria — expande inline
// (sem modal, mesmo padrão do resto do produto) mostrando os documentos de dentro, com upload de
// vários arquivos de uma vez, cada um com seu próprio seletor de categoria (DocumentTypeSelect).
export default function ParecerFolderRow({
  parecer,
  assessoriaId,
  driveConnected,
}: {
  parecer: ParecerData;
  assessoriaId: string;
  driveConnected: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<StagedItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newItems: StagedItem[] = Array.from(files).map((file) => ({
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      docType: "OUTRO",
      uploading: false,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function updateItem(tempId: string, patch: Partial<StagedItem>) {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)));
  }

  function removeItem(tempId: string) {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  }

  // Envia um arquivo: etapa 1, direto do navegador pro Vercel Blob (o token vem do mesmo endpoint
  // que os Anexos de processo usam, ver app/api/attachments/blob-token/route.ts — genérico, não
  // depende de ser Anexo ou Documento de Assessoria); etapa 2, payload pequeno (só a URL do Blob +
  // metadados) pro servidor terminar o fluxo (baixar, mandar pro Drive/OneDrive/Dropbox do
  // escritório, registrar o AssessoriaDocumento — ver app/api/assessoria/documentos/upload/route.ts).
  async function enviarUm(it: StagedItem): Promise<boolean> {
    try {
      const blob = await upload(it.file.name, it.file, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });

      const res = await fetch("/api/assessoria/documentos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          name: it.name.trim() || it.file.name,
          contentType: it.file.type || "application/octet-stream",
          docType: it.docType,
          assessoriaId,
          parecerId: parecer.id,
        }),
      });

      // SEMPRE confere res.ok ANTES de tentar interpretar o corpo como JSON — uma resposta de
      // erro que não vem da nossa rota (413 do proxy, 504 de timeout, página de erro em HTML)
      // não é JSON válido; tentar `res.json()` primeiro faz o catch cair no texto genérico
      // "Erro ao enviar. Verifique sua conexão." mesmo quando a causa é conhecida e específica.
      let data: { error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        updateItem(it.tempId, { uploading: false, error: data?.error || `Erro ao enviar (HTTP ${res.status}).` });
        return false;
      }
      setItems((prev) => prev.filter((x) => x.tempId !== it.tempId));
      return true;
    } catch (e) {
      updateItem(it.tempId, {
        uploading: false,
        error: e instanceof Error ? `Erro ao enviar: ${e.message}` : "Erro ao enviar. Verifique sua conexão.",
      });
      return false;
    }
  }

  // Enfileira os arquivos, um de cada vez (nunca Promise.all) — vários uploads simultâneos para o
  // MESMO parecer podiam disparar findOrCreateChildFolder em paralelo para a mesma pasta (ver
  // lib/googleDrive.ts) e criar pastas duplicadas no Drive, já que a checagem "existe?" e a
  // criação não são atômicas entre requisições concorrentes.
  async function enviarTodos() {
    const pendentes = items.filter((it) => !it.uploading);
    if (pendentes.length === 0) return;
    setItems((prev) => prev.map((it) => (pendentes.some((p) => p.tempId === it.tempId) ? { ...it, uploading: true, error: undefined } : it)));

    for (const it of pendentes) {
      await enviarUm(it);
    }
    router.refresh();
  }

  function handleEdit(formData: FormData) {
    setEditError(null);
    startEditTransition(async () => {
      const result = await updateParecer(parecer.id, {
        name: String(formData.get("name") || ""),
        date: String(formData.get("date") || ""),
        description: String(formData.get("description") || ""),
      });
      if (result.error) setEditError(result.error);
      else {
        setEditOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (parecer.documents.length > 0) {
      setDeleteError("Esta demanda tem documentos dentro — remova-os antes de excluir a pasta.");
      return;
    }
    if (!window.confirm(`Excluir a demanda "${parecer.name}"?`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteParecer(parecer.id);
      if (result.error) setDeleteError(result.error);
      else router.refresh();
    });
  }

  const anyUploading = items.some((it) => it.uploading);

  return (
    <div className="border border-regua rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-sf-apoio"
      >
        <span className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-tx-3" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-tx-3" />
          )}
          <FolderOpen size={15} className="shrink-0 text-tx-3" />
          <span className="font-medium text-tx truncate">{parecer.name}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 text-xs text-tx-2">
          <span>
            {parecer.documents.length} documento{parecer.documents.length === 1 ? "" : "s"}
          </span>
          <span>{formatDate(parecer.date)}</span>
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-regua space-y-2.5">
          {parecer.description && <p className="text-xs text-tx-2 whitespace-pre-wrap">{parecer.description}</p>}

          {parecer.documents.length === 0 ? (
            <p className="text-xs text-tx-3">Nenhum documento dentro desta demanda ainda.</p>
          ) : (
            <div className="divide-y divide-regua">
              {parecer.documents.map((d) => {
                const Icon = getDocumentTypeIcon(d.docType);
                return (
                  <a
                    key={d.id}
                    href={d.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-1.5 text-sm hover:bg-sf-apoio -mx-1 px-1 rounded"
                  >
                    <Icon size={13} className="shrink-0 text-tx-3" />
                    <span className="flex-1 min-w-0 truncate text-tx">{d.name}</span>
                    <span className="shrink-0 text-[10px] text-tx-3 font-mono">{getDocumentTypeLabel(d.docType)}</span>
                    <ExternalLink size={11} className="shrink-0 text-tx-3" />
                  </a>
                );
              })}
            </div>
          )}

          {driveConnected && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-3 cursor-pointer transition-colors ${
                dragOver ? "border-acao bg-acao-bg" : "border-regua hover:border-acao/40 hover:bg-sf-apoio"
              }`}
            >
              <UploadCloud size={16} className="text-tx-2" />
              <p className="text-[11px] text-tx-2 text-center">
                Arraste arquivos aqui, ou clique para selecionar (pode escolher vários)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-1.5">
              {items.map((it) => (
                <div
                  key={it.tempId}
                  className="flex items-center gap-2 rounded-lg border border-regua bg-sf-apoio px-2.5 py-1.5"
                >
                  <span className="text-xs font-medium text-tx truncate flex-1" title={it.name}>
                    {it.name}
                  </span>
                  {it.uploading ? (
                    <Loader2 size={13} className="animate-spin text-tx-2 shrink-0" />
                  ) : (
                    <DocumentTypeSelect
                      value={it.docType}
                      onChange={(v) => updateItem(it.tempId, { docType: v })}
                      className="text-[11px] border border-regua bg-sf text-tx rounded px-1.5 py-1 max-w-[170px] shrink-0"
                      allowCreate
                    />
                  )}
                  {it.error && <span className="text-[10px] text-urgente shrink-0">{it.error}</span>}
                  <button
                    type="button"
                    onClick={() => removeItem(it.tempId)}
                    disabled={it.uploading}
                    className="p-1 text-tx-3 hover:text-atencao shrink-0 disabled:opacity-50"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={enviarTodos}
                disabled={anyUploading}
                className="text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {anyUploading ? "Enviando..." : `Enviar ${items.length} arquivo${items.length > 1 ? "s" : ""} para o Drive`}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx"
            >
              <Pencil size={11} /> Editar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-atencao disabled:opacity-50"
            >
              <Trash2 size={11} /> Excluir pasta
            </button>
          </div>
          {deleteError && <p className="text-[11px] text-urgente">{deleteError}</p>}

          {editOpen && (
            <form action={handleEdit} className="p-3 rounded-lg border border-regua bg-sf-apoio space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input name="name" required defaultValue={parecer.name} placeholder="Nome da demanda" className="parecer-edit-input" />
                <input name="date" type="date" defaultValue={new Date(parecer.date).toISOString().slice(0, 10)} className="parecer-edit-input" />
              </div>
              <textarea
                name="description"
                defaultValue={parecer.description || ""}
                placeholder="Descrição (opcional)"
                rows={2}
                className="parecer-edit-input w-full"
              />
              {editError && <p className="text-xs text-urgente">{editError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editPending}
                  className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {editPending ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setEditOpen(false)} className="text-xs font-semibold text-tx-2">
                  Cancelar
                </button>
              </div>
              <style>{`.parecer-edit-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.5rem; padding:0.4rem 0.65rem; font-size:0.75rem; background:var(--sf-superficie); color:var(--tx); }`}</style>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
