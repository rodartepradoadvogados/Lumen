"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, UploadCloud, Link as LinkIcon, Search } from "lucide-react";
import { createAttachment, deleteAttachment } from "@/lib/actions/attachments";
import { getDocumentTypeIcon, getDocumentTypeLabel, getLinkSourceLabel } from "@/lib/documentTypes";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";

type AttachmentData = {
  id: string;
  name: string;
  driveUrl: string;
  docType: string;
  createdAt: string;
  uploadedBy: { name: string } | null;
};

export default function AttachmentList({
  attachments,
  caseId,
  attendanceId,
  driveConnected,
}: {
  attachments: AttachmentData[];
  caseId?: string;
  attendanceId?: string;
  driveConnected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkDocType, setLinkDocType] = useState("OUTRO");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedName, setStagedName] = useState("");
  const [stagedDocType, setStagedDocType] = useState("OUTRO");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return attachments.filter((a) => {
      if (search.trim() && !a.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (typeFilter !== "TODOS" && a.docType !== typeFilter) return false;
      const day = a.createdAt.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [attachments, search, typeFilter, dateFrom, dateTo]);

  function stageFile(file: File) {
    setError(null);
    setStagedFile(file);
    setStagedName(file.name);
    setStagedDocType("OUTRO");
  }

  async function confirmStagedFile() {
    if (!stagedFile) return;
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", stagedFile);
    formData.append("name", stagedName.trim() || stagedFile.name);
    formData.append("docType", stagedDocType);
    if (caseId) formData.append("caseId", caseId);
    if (attendanceId) formData.append("attendanceId", attendanceId);

    try {
      const res = await fetch("/api/attachments/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar arquivo.");
      } else {
        setStagedFile(null);
        router.refresh();
      }
    } catch {
      setError("Erro ao enviar arquivo. Verifique sua conexão.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  function handleAddLink(formData: FormData) {
    startTransition(async () => {
      await createAttachment({
        name: String(formData.get("name")),
        driveUrl: String(formData.get("driveUrl")),
        docType: linkDocType,
        caseId,
        attendanceId,
      });
      setLinkMode(false);
      setLinkDocType("OUTRO");
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Remover este anexo? O arquivo continuará no Drive, apenas o vínculo com o sistema será removido.")) return;
    startTransition(async () => {
      await deleteAttachment(id);
      router.refresh();
    });
  }

  return (
    <div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome"
              className="w-full text-xs border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg pl-7 pr-2.5 py-1.5"
            />
          </div>
          <DocumentTypeSelect
            value={typeFilter}
            onChange={setTypeFilter}
            allowAll
            includeLegacy
            className="text-xs border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2 py-1.5 max-w-[180px]"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Enviado a partir de"
            className="text-xs border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2 py-1.5"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Enviado até"
            className="text-xs border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2 py-1.5"
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
        {filtered.map((a) => {
          const Icon = getDocumentTypeIcon(a.docType);
          return (
            <div
              key={a.id}
              className="group relative bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 rounded-lg p-3 hover:border-gold-500/40 transition-colors"
            >
              <a href={a.driveUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center text-center gap-1.5">
                <div className="h-10 w-10 rounded-lg bg-navy-900/5 dark:bg-white/10 text-navy-800 dark:text-cream-50/80 flex items-center justify-center">
                  <Icon size={18} />
                </div>
                <p className="text-xs font-medium text-navy-900 dark:text-cream-50 truncate w-full" title={a.name}>
                  {a.name}
                </p>
                <p className="text-[10px] text-navy-800/45 dark:text-cream-50/45 truncate w-full" title={getDocumentTypeLabel(a.docType)}>
                  {getDocumentTypeLabel(a.docType)}
                </p>
                <span className="flex items-center gap-0.5 text-[10px] text-gold-700 dark:text-gold-400">
                  <ExternalLink size={10} /> {getLinkSourceLabel(a.driveUrl)}
                </span>
              </a>
              <button
                onClick={() => handleDelete(a.id)}
                disabled={pending}
                data-tip="Remover anexo"
                className="absolute top-1 right-1 p-1 rounded-md text-navy-800/25 dark:text-cream-50/25 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-navy-800/40 dark:text-cream-50/40 col-span-full py-2">
            {attachments.length === 0 ? "Nenhum anexo ainda." : "Nenhum anexo encontrado com esse filtro."}
          </p>
        )}
      </div>

      {!driveConnected && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg px-2.5 py-1.5 mb-2">
          Drive ainda não conectado. Peça a um administrador para conectar em Configurações, ou cole um link manualmente abaixo.
        </p>
      )}

      {driveConnected && !stagedFile && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
            dragOver ? "border-gold-500 bg-gold-500/5" : "border-navy-800/15 dark:border-white/15 hover:border-gold-500/40 hover:bg-cream-50 dark:hover:bg-white/5"
          }`}
        >
          <UploadCloud size={20} className="text-navy-800/40 dark:text-cream-50/40" />
          <p className="text-xs text-navy-800/60 dark:text-cream-50/60 text-center">
            Arraste um arquivo aqui, ou clique para selecionar do computador
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) stageFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {stagedFile && (
        <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2">
          <p className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">Esse documento é:</p>
          <input
            value={stagedName}
            onChange={(e) => setStagedName(e.target.value)}
            placeholder="Nome do documento"
            className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2.5 py-1.5"
          />
          <DocumentTypeSelect
            value={stagedDocType}
            onChange={setStagedDocType}
            className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2.5 py-1.5"
          />
          <div className="flex gap-2">
            <button
              onClick={confirmStagedFile}
              disabled={uploading}
              className="flex-1 bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 dark:text-navy-950 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50"
            >
              {uploading ? "Enviando..." : "Enviar para o Drive"}
            </button>
            <button
              onClick={() => setStagedFile(null)}
              disabled={uploading}
              className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-2.5 py-1.5 mt-2">
          {error}
        </p>
      )}

      <div className="mt-2">
        {linkMode ? (
          <form action={handleAddLink} className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2">
            <input
              name="name"
              required
              placeholder="Nome do documento"
              className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2.5 py-1.5"
            />
            <input
              name="driveUrl"
              type="url"
              required
              placeholder="Link do Drive, Dropbox, OneDrive..."
              className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2.5 py-1.5"
            />
            <div>
              <p className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 mb-1">Esse documento é:</p>
              <DocumentTypeSelect
                value={linkDocType}
                onChange={setLinkDocType}
                className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2.5 py-1.5"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 dark:text-navy-950 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50"
              >
                {pending ? "Salvando..." : "Salvar anexo"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkMode(false);
                  setLinkDocType("OUTRO");
                }}
                className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setLinkMode(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2.5 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5"
          >
            <LinkIcon size={13} /> ou colar um link (Drive, Dropbox, OneDrive...)
          </button>
        )}
      </div>
    </div>
  );
}
