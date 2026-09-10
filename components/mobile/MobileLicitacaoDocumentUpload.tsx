"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Paperclip, X } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";

// Envio de UM documento de Licitação pelo celular — mesmo espírito de
// components/mobile/MobileDocumentUpload.tsx (documentos de Assessoria), mas chamando
// finalizeAttachmentUpload (Server Action) direto em vez da rota
// app/api/assessoria/documentos/upload/route.ts: Attachment (Processo/Atendimento/Licitação) já
// usa Server Action pra tudo, diferente de AssessoriaDocumento, que preferiu uma rota REST por
// motivos históricos (ver comentário daquele arquivo).
//
// Ganha um campo a mais que a versão de Assessoria não tem: "Atribuir a" — só aparece quando
// `taskOptions` vem preenchido (a tela mostra documentos de mais de uma demanda ao mesmo tempo,
// ver MobileLicitacaoDetail.tsx), mesma lógica de AttachmentList.tsx no site.
export default function MobileLicitacaoDocumentUpload({
  licitacaoId,
  taskId,
  taskOptions,
}: {
  licitacaoId: string;
  // Fixo = documento entra direto nesta demanda (upload feito já filtrado por ela); ausente +
  // `taskOptions` preenchido = pergunta "Geral ou de qual demanda" antes de enviar.
  taskId?: string;
  taskOptions?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("OUTRO");
  const [assignTaskId, setAssignTaskId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showTaskPicker = Boolean(taskOptions && taskOptions.length > 0 && !taskId);

  function pickFile(f: File | null) {
    if (!f) return;
    setError(null);
    setFile(f);
    setName(f.name);
    setDocType("OUTRO");
    setAssignTaskId("");
  }

  function cancel() {
    setFile(null);
    setError(null);
  }

  async function send() {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });
      const result = await finalizeAttachmentUpload({
        blobUrl: blob.url,
        name: name.trim() || file.name,
        contentType: file.type || "application/octet-stream",
        docType,
        licitacaoId,
        taskId: taskId || assignTaskId || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setFile(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? `Erro ao enviar: ${e.message}` : "Erro ao enviar. Verifique sua conexão.");
    } finally {
      setUploading(false);
    }
  }

  if (!file) {
    return (
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 text-[13px] font-semibold text-acao border border-dashed border-regua hover:border-acao/40 py-2.5 transition-colors mt-2"
      >
        <Paperclip size={13} /> Anexar documento
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </button>
    );
  }

  return (
    <div className="border border-regua bg-sf-apoio p-2.5 space-y-2 mt-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-[13px] font-medium text-tx truncate" title={file.name}>
          {file.name}
        </span>
        <button type="button" onClick={cancel} disabled={uploading} className="shrink-0 text-tx-3 hover:text-atencao disabled:opacity-50" aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do documento"
        className="w-full text-[13px] border border-regua bg-sf text-tx px-2.5 py-1.5"
      />
      <DocumentTypeSelect value={docType} onChange={setDocType} className="w-full text-[13px] border border-regua bg-sf text-tx px-2.5 py-1.5" allowCreate />
      {showTaskPicker && (
        <select value={assignTaskId} onChange={(e) => setAssignTaskId(e.target.value)} className="w-full text-[13px] border border-regua bg-sf text-tx px-2.5 py-1.5">
          <option value="">Geral da licitação</option>
          {taskOptions!.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      )}
      {error && <p role="alert" className="text-[13px] text-urgente">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={uploading}
        className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-[13px] font-semibold py-1.5 disabled:opacity-50"
      >
        {uploading ? "Enviando..." : "Enviar para o Drive"}
      </button>
    </div>
  );
}
