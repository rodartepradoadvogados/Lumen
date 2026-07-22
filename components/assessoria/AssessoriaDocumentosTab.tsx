"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDocumento, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { formatDate } from "@/components/ui";
import { getDocumentTypeIcon, getDocumentTypeLabel, getLinkSourceLabel } from "@/lib/documentTypes";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { Plus, Search, UploadCloud, ExternalLink } from "lucide-react";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

export default function AssessoriaDocumentosTab({ assessoria, driveConnected }: { assessoria: Assessoria; driveConnected: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [linkDocType, setLinkDocType] = useState("OUTRO");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedName, setStagedName] = useState("");
  const [stagedDocType, setStagedDocType] = useState("OUTRO");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return assessoria.documents.filter((d) => {
      if (search.trim() && !d.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (typeFilter !== "TODOS" && d.docType !== typeFilter) return false;
      const day = new Date(d.date).toISOString().slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [assessoria.documents, search, typeFilter, dateFrom, dateTo]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addDocumento(assessoria.id, {
        name: String(formData.get("name") || ""),
        docType: String(formData.get("docType") || "OUTRO"),
        driveUrl: String(formData.get("driveUrl") || ""),
        date: String(formData.get("date") || ""),
      });
      if (result.error) setError(result.error);
      else {
        setFormOpen(false);
        setLinkDocType("OUTRO");
      }
    });
  }

  function stageFile(file: File) {
    setError(null);
    setStagedFile(file);
    setStagedName(file.name);
    setStagedDocType("OUTRO");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  async function confirmStagedFile() {
    if (!stagedFile) return;
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", stagedFile);
    formData.append("name", stagedName.trim() || stagedFile.name);
    formData.append("docType", stagedDocType);
    formData.append("assessoriaId", assessoria.id);

    try {
      const res = await fetch("/api/assessoria/documentos/upload", { method: "POST", body: formData });
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

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome"
              className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg pl-7 pr-2.5 py-1.5"
            />
          </div>
          <DocumentTypeSelect
            value={typeFilter}
            onChange={setTypeFilter}
            allowAll
            includeLegacy
            className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2 py-1.5 max-w-[220px]"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Enviado a partir de"
            className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2 py-1.5"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Enviado até"
            className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-2 py-1.5"
          />
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Colar link
        </button>
      </div>

      {formOpen && (
        <form
          action={handleSubmit}
          className="mb-4 p-4 rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-50 dark:bg-navy-800 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="name" required placeholder="Nome do documento" className="doc-input" />
            <DocumentTypeSelect name="docType" value={linkDocType} onChange={setLinkDocType} className="doc-input" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="driveUrl" required type="url" placeholder="Link do Drive, Dropbox, OneDrive..." className="doc-input" />
            <input name="date" type="date" className="doc-input" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
              Cancelar
            </button>
          </div>
          <style>{`.doc-input { width:100%; border:1px solid rgba(15,31,61,0.12); border-radius:0.5rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:#fff; } .dark .doc-input { border-color: rgba(255,255,255,0.15); background:#0f1f3d; color:#fbfaf7; }`}</style>
        </form>
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
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors mb-4 ${
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
        <div className="p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2 mb-4">
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
              className="flex-1 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50"
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

      {filtered.length === 0 ? (
        <p className="text-sm text-navy-800/40 dark:text-cream-50/40 py-8 text-center">
          {assessoria.documents.length === 0 ? "Nenhum documento cadastrado ainda." : "Nenhum documento encontrado com esse filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 border-b border-navy-800/10 dark:border-white/10">
                <th className="pb-2 pr-3">Nome</th>
                <th className="pb-2 pr-3">Categoria</th>
                <th className="pb-2 pr-3">Data</th>
                <th className="pb-2 pr-3">Vinculado a</th>
                <th className="pb-2 pr-3">Enviado por</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
              {filtered.map((d) => {
                const Icon = getDocumentTypeIcon(d.docType);
                return (
                  <tr key={d.id}>
                    <td className="py-2.5 pr-3 font-medium text-navy-900 dark:text-cream-50">
                      <span className="flex items-center gap-2">
                        <Icon size={15} className="text-navy-800/40 dark:text-cream-50/40 shrink-0" />
                        {d.name}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{getDocumentTypeLabel(d.docType)}</td>
                    <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{formatDate(d.date)}</td>
                    <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{d.case?.title || "—"}</td>
                    <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{d.uploadedBy?.name || "—"}</td>
                    <td className="py-2.5">
                      <a
                        href={d.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-gold-600 dark:text-gold-400 font-semibold text-xs"
                      >
                        <ExternalLink size={11} /> {getLinkSourceLabel(d.driveUrl)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
