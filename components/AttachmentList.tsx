"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, X, ExternalLink, UploadCloud, Link as LinkIcon } from "lucide-react";
import { createAttachment, deleteAttachment } from "@/lib/actions/attachments";

type AttachmentData = {
  id: string;
  name: string;
  driveUrl: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    if (caseId) formData.append("caseId", caseId);
    if (attendanceId) formData.append("attendanceId", attendanceId);

    try {
      const res = await fetch("/api/attachments/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar arquivo.");
      } else {
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
    if (file) uploadFile(file);
  }

  function handleAddLink(formData: FormData) {
    startTransition(async () => {
      await createAttachment({
        name: String(formData.get("name")),
        driveUrl: String(formData.get("driveUrl")),
        caseId,
        attendanceId,
      });
      setLinkMode(false);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Remover este anexo? O arquivo continuará no Google Drive, apenas o vínculo com o sistema será removido.")) return;
    startTransition(async () => {
      await deleteAttachment(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
        {attachments.map((a) => (
          <div key={a.id} className="group relative bg-cream-50 border border-navy-800/8 rounded-lg p-3 hover:border-gold-500/40 transition-colors">
            <a href={a.driveUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center text-center gap-1.5">
              <div className="h-10 w-10 rounded-lg bg-navy-900/5 text-navy-800 flex items-center justify-center">
                <FileText size={18} />
              </div>
              <p className="text-xs font-medium text-navy-900 truncate w-full" title={a.name}>
                {a.name}
              </p>
              <span className="flex items-center gap-0.5 text-[10px] text-gold-700">
                <ExternalLink size={10} /> Abrir no Drive
              </span>
            </a>
            <button
              onClick={() => handleDelete(a.id)}
              disabled={pending}
              title="Remover anexo"
              className="absolute top-1 right-1 p-1 rounded-md text-navy-800/25 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {attachments.length === 0 && <p className="text-xs text-navy-800/40 col-span-full py-2">Nenhum anexo ainda.</p>}
      </div>

      {!driveConnected && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
          Google Drive ainda não conectado. Peça a um administrador para conectar em Configurações, ou cole um link manualmente abaixo.
        </p>
      )}

      {driveConnected && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
            dragOver ? "border-gold-500 bg-gold-500/5" : "border-navy-800/15 hover:border-gold-500/40 hover:bg-cream-50"
          }`}
        >
          <UploadCloud size={20} className="text-navy-800/40" />
          <p className="text-xs text-navy-800/60 text-center">
            {uploading ? "Enviando para o Google Drive..." : "Arraste um arquivo aqui, ou clique para selecionar do computador"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mt-2">{error}</p>}

      <div className="mt-2">
        {linkMode ? (
          <form action={handleAddLink} className="p-3 rounded-lg bg-cream-50 border border-navy-800/8 space-y-2">
            <input name="name" required placeholder="Nome do documento" className="w-full text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
            <input name="driveUrl" type="url" required placeholder="Link do Google Drive" className="w-full text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className="flex-1 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
                {pending ? "Salvando..." : "Salvar anexo"}
              </button>
              <button type="button" onClick={() => setLinkMode(false)} className="px-3 text-xs font-semibold text-navy-800/50 hover:text-navy-900">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setLinkMode(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy-800/50 hover:text-navy-900 px-2.5 py-1.5 rounded-lg hover:bg-cream-100"
          >
            <LinkIcon size={13} /> ou colar um link do Drive já existente
          </button>
        )}
      </div>
    </div>
  );
}
