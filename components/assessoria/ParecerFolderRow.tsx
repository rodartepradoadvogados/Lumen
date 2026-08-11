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
      setDeleteError("Este parecer tem documentos dentro — remova-os antes de excluir a pasta.");
      return;
    }
    if (!window.confirm(`Excluir o parecer "${parecer.name}"?`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteParecer(parecer.id);
      if (result.error) setDeleteError(result.error);
      else router.refresh();
    });
  }

  const anyUploading = items.some((it) => it.uploading);

  return (
    <div className="border border-navy-800/8 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-cream-50 dark:hover:bg-white/5"
      >
        <span className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-navy-800/40 dark:text-cream-50/40" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-navy-800/40 dark:text-cream-50/40" />
          )}
          <FolderOpen size={15} className="shrink-0 text-gold-700 dark:text-gold-400" />
          <span className="font-medium text-navy-900 dark:text-cream-50 truncate">{parecer.name}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 text-xs text-navy-800/45 dark:text-cream-50/45">
          <span>
            {parecer.documents.length} documento{parecer.documents.length === 1 ? "" : "s"}
          </span>
          <span>{formatDate(parecer.date)}</span>
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-navy-800/8 dark:border-white/10 space-y-2.5">
          {parecer.description && <p className="text-xs text-navy-800/60 dark:text-cream-50/60 whitespace-pre-wrap">{parecer.description}</p>}

          {parecer.documents.length === 0 ? (
            <p className="text-xs text-navy-800/40 dark:text-cream-50/40">Nenhum documento dentro deste parecer ainda.</p>
          ) : (
            <div className="divide-y divide-navy-800/5 dark:divide-white/10">
              {parecer.documents.map((d) => {
                const Icon = getDocumentTypeIcon(d.docType);
                return (
                  <a
                    key={d.id}
                    href={d.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-1.5 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
                  >
                    <Icon size={13} className="shrink-0 text-navy-800/40 dark:text-cream-50/40" />
                    <span className="flex-1 min-w-0 truncate text-navy-900 dark:text-cream-50">{d.name}</span>
                    <span className="shrink-0 text-[10px] text-navy-800/40 dark:text-cream-50/40 font-mono">{getDocumentTypeLabel(d.docType)}</span>
                    <ExternalLink size={11} className="shrink-0 text-navy-800/30 dark:text-cream-50/30" />
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
                dragOver ? "border-gold-500 bg-gold-500/5" : "border-navy-800/15 dark:border-white/15 hover:border-gold-500/40 hover:bg-cream-50 dark:hover:bg-white/5"
              }`}
            >
              <UploadCloud size={16} className="text-navy-800/40 dark:text-cream-50/40" />
              <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 text-center">
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
                  className="flex items-center gap-2 rounded-lg border border-navy-800/8 dark:border-white/10 bg-cream-50 dark:bg-navy-800 px-2.5 py-1.5"
                >
                  <span className="text-xs font-medium text-navy-900 dark:text-cream-50 truncate flex-1" title={it.name}>
                    {it.name}
                  </span>
                  {it.uploading ? (
                    <Loader2 size={13} className="animate-spin text-navy-800/40 dark:text-cream-50/40 shrink-0" />
                  ) : (
                    <DocumentTypeSelect
                      value={it.docType}
                      onChange={(v) => updateItem(it.tempId, { docType: v })}
                      className="text-[11px] border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded px-1.5 py-1 max-w-[170px] shrink-0"
                    />
                  )}
                  {it.error && <span className="text-[10px] text-red-600 dark:text-red-400 shrink-0">{it.error}</span>}
                  <button
                    type="button"
                    onClick={() => removeItem(it.tempId)}
                    disabled={it.uploading}
                    className="p-1 text-navy-800/30 dark:text-cream-50/30 hover:text-red-600 dark:hover:text-red-400 shrink-0 disabled:opacity-50"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={enviarTodos}
                disabled={anyUploading}
                className="text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 dark:text-navy-950 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {anyUploading ? "Enviando..." : `Enviar ${items.length} arquivo${items.length > 1 ? "s" : ""} para o Drive`}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setEditOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
            >
              <Pencil size={11} /> Editar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
            >
              <Trash2 size={11} /> Excluir pasta
            </button>
          </div>
          {deleteError && <p className="text-[11px] text-red-600">{deleteError}</p>}

          {editOpen && (
            <form action={handleEdit} className="p-3 rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-50 dark:bg-navy-800 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input name="name" required defaultValue={parecer.name} placeholder="Nome do parecer" className="parecer-edit-input" />
                <input name="date" type="date" defaultValue={new Date(parecer.date).toISOString().slice(0, 10)} className="parecer-edit-input" />
              </div>
              <textarea
                name="description"
                defaultValue={parecer.description || ""}
                placeholder="Descrição (opcional)"
                rows={2}
                className="parecer-edit-input w-full"
              />
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editPending}
                  className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {editPending ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setEditOpen(false)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
                  Cancelar
                </button>
              </div>
              <style>{`.parecer-edit-input { width:100%; border:1px solid rgba(15,31,61,0.12); border-radius:0.5rem; padding:0.4rem 0.65rem; font-size:0.75rem; background:#fff; } .dark .parecer-edit-input { border-color: rgba(255,255,255,0.15); background:#0f1f3d; color:#fbfaf7; }`}</style>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
