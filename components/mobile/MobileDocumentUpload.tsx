"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Paperclip, X } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";

// Envio de documento da Assessoria pelo celular — mesmo fluxo de duas etapas do desktop (ver
// components/assessoria/ParecerFolderRow.tsx e components/assessoria/AssessoriaDocumentosTab.tsx):
// etapa 1, o navegador sobe o arquivo direto pro Vercel Blob (token genérico, ver
// app/api/attachments/blob-token/route.ts); etapa 2, um payload pequeno (só a URL do Blob +
// metadados) fecha o fluxo em app/api/assessoria/documentos/upload/route.ts — baixa o conteúdo,
// manda pro provedor de armazenamento do escritório e registra o AssessoriaDocumento.
//
// Antes desta rodada esta seção era só leitura de propósito (ver comentário em
// MobileAssessoriaDocumentsSection.tsx): DocumentTypeSelect.tsx e lib/documentTypes.ts estavam
// sendo reescritos por outro agente. Estabilizados, o upload passa a existir aqui — versão de
// UM arquivo por vez (não a fila de vários do desktop): mais simples de operar com o polegar e
// suficiente para o caso de uso do celular (anexar o documento que acabou de assinar/receber),
// sem abrir mão de nenhuma etapa de segurança do fluxo do site.
export default function MobileDocumentUpload({
  assessoriaId,
  parecerId,
}: {
  assessoriaId: string;
  // Presente = documento entra dentro desta pasta de Demanda; ausente = documento solto
  // (mesma regra do backend, ver app/api/assessoria/documentos/upload/route.ts).
  parecerId?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("OUTRO");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    setError(null);
    setFile(f);
    setName(f.name);
    setDocType("OUTRO");
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

      const res = await fetch("/api/assessoria/documentos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          name: name.trim() || file.name,
          contentType: file.type || "application/octet-stream",
          docType,
          assessoriaId,
          parecerId,
        }),
      });

      // SEMPRE confere res.ok ANTES de tentar interpretar o corpo como JSON — mesma regra de
      // ParecerFolderRow.tsx: um erro que não vem da nossa rota (413/504, página de erro em
      // HTML) não é JSON válido.
      let data: { error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data?.error || `Erro ao enviar (HTTP ${res.status}).`);
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
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover border border-dashed border-regua hover:border-acao/40 py-2.5 transition-colors"
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
    <div className=" border border-regua bg-sf-apoio p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 text-xs font-medium text-tx truncate" title={file.name}>
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
        className="w-full text-xs border border-regua bg-sf text-tx px-2.5 py-1.5"
      />
      <DocumentTypeSelect
        value={docType}
        onChange={setDocType}
        excludeKeys={["PARECER"]}
        className="w-full text-xs border border-regua bg-sf text-tx px-2.5 py-1.5"
        allowCreate
      />
      {error && <p className="text-[11px] text-urgente">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={uploading}
        className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold py-1.5 disabled:opacity-50"
      >
        {uploading ? "Enviando..." : "Enviar para o Drive"}
      </button>
    </div>
  );
}
