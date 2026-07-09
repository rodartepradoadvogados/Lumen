"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, X, ExternalLink } from "lucide-react";
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
}: {
  attachments: AttachmentData[];
  caseId?: string;
  attendanceId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      await createAttachment({
        name: String(formData.get("name")),
        driveUrl: String(formData.get("driveUrl")),
        caseId,
        attendanceId,
      });
      setOpen(false);
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

      {open ? (
        <form action={handleAdd} className="p-3 rounded-lg bg-cream-50 border border-navy-800/8 space-y-2">
          <p className="text-[11px] text-navy-800/50">
            Faça upload do arquivo na pasta do Google Drive de <strong>rodartepradoadvogados@gmail.com</strong>, copie o link de compartilhamento e cole abaixo.
          </p>
          <input name="name" required placeholder="Nome do documento" className="w-full text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
          <input name="driveUrl" type="url" required placeholder="Link do Google Drive" className="w-full text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="flex-1 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Salvar anexo"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 text-xs font-semibold text-navy-800/50 hover:text-navy-900">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gold-700 hover:text-gold-900 px-2.5 py-1.5 rounded-lg bg-gold-500/10 hover:bg-gold-500/20"
        >
          <Plus size={13} /> Adicionar anexo (link do Drive)
        </button>
      )}
    </div>
  );
}
