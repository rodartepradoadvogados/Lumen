"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ChevronRight, ExternalLink, Loader2, Pencil, Trash2, UploadCloud, X } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { formatDate } from "@/components/ui";
import { updateParecer, deleteParecer, deleteDocumento, retryParecerDriveFolder } from "@/lib/actions/assessoria";
import SlideDrawer from "@/components/motion/SlideDrawer";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";
import DriveFolderMissingNotice from "@/components/assessoria/DriveFolderMissingNotice";
import ReconciliarAnexosDriveButton from "@/components/ReconciliarAnexosDriveButton";

type ParecerDocumento = { id: string; name: string; docType: string; driveUrl: string; date: Date | string };

// Formato mínimo que este componente precisa — assessoria.pareceres (ver getAssessoriaDetail em
// lib/actions/assessoria.ts) sempre traz mais campos que isso, mas TS aceita de boa (não é um
// literal, é uma variável — excesso de propriedade não é erro).
export type ParecerData = {
  id: string;
  name: string;
  date: Date | string;
  description: string | null;
  driveFolderId: string | null;
  documents: ParecerDocumento[];
};

// Um arquivo ainda não enviado, aguardando confirmação (nome + categoria) — mesmo espírito de
// StagedItem em components/NewCaseAttachmentsField.tsx. Também passa pelo Vercel Blob antes de
// chegar no servidor (ver enviarTodos abaixo) — o Parecer já existe no momento do upload, mas o
// arquivo pode ser grande (processo digitalizado inteiro, por exemplo), e uma Vercel Serverless
// Function tem limite de payload de entrada bem menor que isso.
type StagedItem = { tempId: string; file: File; name: string; docType: string; uploading: boolean; error?: string };

// Card + gaveta suspensa de uma demanda (Parecer) na aba "Demandas, Processos e Casos" da
// Assessoria — mesmo modelo visual aprovado para a aba Licitações (card com título + colunas,
// clique abre tudo numa SlideDrawer). Substitui o antigo ParecerFolderRow (accordion inline).
export default function ParecerCard({
  parecer,
  assessoriaId,
  driveConnected,
  storageMessage,
}: {
  parecer: ParecerData;
  assessoriaId: string;
  driveConnected: boolean;
  storageMessage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StagedItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  const [docDeleteError, setDocDeleteError] = useState<string | null>(null);
  const [docDeletingId, setDocDeletingId] = useState<string | null>(null);
  const [, startDocDeleteTransition] = useTransition();

  function handleDeleteDocumento(doc: ParecerDocumento) {
    if (!window.confirm(`Excluir o documento "${doc.name}"? Essa ação também remove o arquivo do armazenamento.`)) return;
    setDocDeleteError(null);
    setDocDeletingId(doc.id);
    startDocDeleteTransition(async () => {
      const result = await deleteDocumento(doc.id);
      setDocDeletingId(null);
      if (result.error) setDocDeleteError(result.error);
      else router.refresh();
    });
  }

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
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  const anyUploading = items.some((it) => it.uploading);

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left border border-regua rounded-lg bg-sf p-3.5 hover:border-regua-forte transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-tx text-corpo truncate">{parecer.name}</p>
          <ChevronRight size={16} className="text-tx-3 shrink-0 mt-0.5" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2">
          <div>
            <p className="text-etiqueta font-bold uppercase tracking-wide text-tx-3 mb-1">Data</p>
            <p className="text-corpo text-tx tabular-nums">{formatDate(parecer.date)}</p>
          </div>
          <div>
            <p className="text-etiqueta font-bold uppercase tracking-wide text-tx-3 mb-1">Documentos</p>
            <p className="text-corpo text-tx tabular-nums">{parecer.documents.length}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-etiqueta font-bold uppercase tracking-wide text-tx-3 mb-1">Descrição</p>
            <p className="text-corpo text-tx truncate" title={parecer.description || ""}>{parecer.description || "—"}</p>
          </div>
        </div>
      </button>

      {/* driveFolderId nulo com o armazenamento conectado só acontece se a criação da pasta
          falhou silenciosamente (bug corrigido na Tarefa C, ver createParecer em
          lib/actions/assessoria.ts) — o upload de documento tenta de novo sozinho, mas até lá a
          demanda fica visivelmente sem pasta. */}
      {driveConnected && !parecer.driveFolderId && (
        <DriveFolderMissingNotice
          message={`A demanda "${parecer.name}" ainda não tem pasta no armazenamento em nuvem.`}
          retry={retryParecerDriveFolder.bind(null, parecer.id)}
        />
      )}

      {open && (
        <SlideDrawer
          title={parecer.name}
          subtitle={formatDate(parecer.date)}
          onClose={() => setOpen(false)}
          // Mesma largura da gaveta de Licitações (ver AssessoriaLicitacoesTab.tsx) — pedido
          // explícito para toda a aba "Demandas, Processos e Casos" usar a mesma medida.
          widthClassName="w-[92vw] sm:w-[980px]"
          actions={
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-acao px-1.5 py-1"
            >
              <Pencil size={13} /> Editar
            </button>
          }
        >
          <div className="p-5 flex flex-col gap-4">
            <div className="bg-sf-apoio border border-regua p-4">
              <h4 className="text-etiqueta font-bold uppercase tracking-wide text-tx-2 mb-2">Dados da demanda</h4>
              {parecer.description ? (
                <p className="text-sm text-tx whitespace-pre-wrap">{parecer.description}</p>
              ) : (
                <p className="text-sm text-tx-3">Sem descrição.</p>
              )}
            </div>

            <div className="bg-sf-apoio border border-regua p-4">
              <h4 className="text-etiqueta font-bold uppercase tracking-wide text-tx-2 mb-2.5">Documentos</h4>

              {driveConnected && (
                <div className="mb-2.5">
                  <ReconciliarAnexosDriveButton scope={{ kind: "PARECER", parecerId: parecer.id }} compact />
                </div>
              )}

              {parecer.documents.length === 0 ? (
                <p className="text-sm text-tx-3 mb-2">Nenhum documento dentro desta demanda ainda.</p>
              ) : (
                <div className="divide-y divide-regua mb-2">
                  {parecer.documents.map((d) => {
                    const Icon = getDocumentTypeIcon(d.docType);
                    return (
                      <div key={d.id} className="flex items-center gap-1 py-1.5 -mx-1 px-1 hover:bg-sf">
                        <a href={d.driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                          <Icon size={13} className="shrink-0 text-tx-3" />
                          <span className="flex-1 min-w-0 truncate text-tx">{d.name}</span>
                          <span className="shrink-0 text-etiqueta text-tx-3 font-mono">{getDocumentTypeLabel(d.docType)}</span>
                          <ExternalLink size={11} className="shrink-0 text-tx-3" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocumento(d)}
                          disabled={docDeletingId === d.id}
                          data-tip="Excluir documento"
                          className="p-1 text-tx-3 hover:text-atencao shrink-0 disabled:opacity-50"
                        >
                          {docDeletingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {docDeleteError && <p className="text-etiqueta text-urgente mb-2">{docDeleteError}</p>}

              {driveConnected ? (
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
                  className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed p-3 cursor-pointer transition-colors ${
                    dragOver ? "border-acao bg-acao-bg" : "border-regua hover:border-acao/40 hover:bg-sf"
                  }`}
                >
                  <UploadCloud size={16} className="text-tx-2" />
                  <p className="text-etiqueta text-tx-2 text-center">Arraste arquivos aqui, ou clique para selecionar (pode escolher vários)</p>
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
              ) : (
                <StorageDisconnectedNotice message={storageMessage} />
              )}

              {items.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {items.map((it) => (
                    <div key={it.tempId} className="flex items-center gap-2 border border-regua bg-sf px-2.5 py-1.5">
                      <span className="text-xs font-medium text-tx truncate flex-1" title={it.name}>
                        {it.name}
                      </span>
                      {it.uploading ? (
                        <Loader2 size={13} className="animate-spin text-tx-2 shrink-0" />
                      ) : (
                        <DocumentTypeSelect
                          value={it.docType}
                          onChange={(v) => updateItem(it.tempId, { docType: v })}
                          className="text-etiqueta border border-regua bg-sf text-tx rounded px-1.5 py-1 max-w-[170px] shrink-0"
                          allowCreate
                        />
                      )}
                      {it.error && <span className="text-etiqueta text-urgente shrink-0">{it.error}</span>}
                      <button type="button" onClick={() => removeItem(it.tempId)} disabled={it.uploading} className="p-1 text-tx-3 hover:text-atencao shrink-0 disabled:opacity-50">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={enviarTodos}
                    disabled={anyUploading}
                    className="text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-1.5 disabled:opacity-50"
                  >
                    {anyUploading ? "Enviando..." : `Enviar ${items.length} arquivo${items.length > 1 ? "s" : ""} para o Drive`}
                  </button>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                className="flex items-center gap-1 text-etiqueta font-semibold text-tx-2 hover:text-atencao disabled:opacity-50"
              >
                <Trash2 size={11} /> Excluir pasta
              </button>
              {deleteError && <p className="text-etiqueta text-urgente mt-1">{deleteError}</p>}
            </div>
          </div>
        </SlideDrawer>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-[60] bg-grafite-900/40 flex items-center justify-center p-4" onClick={() => setEditOpen(false)}>
          <div className="bg-sf shadow-modal rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Editar dados da demanda</h3>
              <button onClick={() => setEditOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <form action={handleEdit} className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-etiqueta text-tx-2">Nome da demanda</label>
                  <input name="name" required defaultValue={parecer.name} className="parecer-edit-input" />
                </div>
                <div>
                  <label className="text-etiqueta text-tx-2">Data</label>
                  <input name="date" type="date" defaultValue={new Date(parecer.date).toISOString().slice(0, 10)} className="parecer-edit-input" />
                </div>
              </div>
              <div>
                <label className="text-etiqueta text-tx-2">Descrição</label>
                <textarea name="description" defaultValue={parecer.description || ""} rows={3} placeholder="Descrição (opcional)" className="parecer-edit-input w-full" />
              </div>
              {editError && <p className="text-xs text-urgente">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={editPending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 disabled:opacity-50">
                  {editPending ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" onClick={() => setEditOpen(false)} className="text-xs font-semibold text-tx-2">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
