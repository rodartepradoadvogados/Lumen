"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { UploadCloud, X, Loader2 } from "lucide-react";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";

type StagedItem = {
  tempId: string;
  name: string;
  contentType: string;
  docType: string;
  blobUrl?: string;
  uploading: boolean;
  error?: string;
};

// Payload gravado no input hidden e lido pelo server action de criação do caso (createCase /
// createCaseMobile), que finaliza cada item com o id real do caso assim que ele existe.
export type StagedCaseAttachment = { blobUrl: string; name: string; contentType: string; docType?: string };

// Campo de anexos do formulário de Novo Processo/Caso. O caso ainda não existe nesse momento, então
// não dá pra gravar o Attachment de verdade ainda — mas o arquivo já pode subir pro Vercel Blob
// (mesmo mecanismo de components/AttachmentList.tsx: upload() direto do navegador, sem passar pela
// nossa function). O que fica pendente é só a etapa 2 (finalizeAttachmentUpload, que manda pro
// Drive e cria o Attachment): isso acontece depois que o servidor cria o caso, usando o id real.
export default function NewCaseAttachmentsField({ driveConnected }: { driveConnected: boolean }) {
  const [items, setItems] = useState<StagedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    const newItems: StagedItem[] = fileArr.map((file) => ({
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      contentType: file.type || "application/octet-stream",
      docType: "OUTRO",
      uploading: true,
    }));
    setItems((prev) => [...prev, ...newItems]);

    await Promise.all(
      fileArr.map(async (file, i) => {
        const tempId = newItems[i].tempId;
        try {
          const blob = await upload(file.name, file, {
            access: "public",
            handleUploadUrl: "/api/attachments/blob-token",
          });
          setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, blobUrl: blob.url, uploading: false } : it)));
        } catch {
          setItems((prev) =>
            prev.map((it) => (it.tempId === tempId ? { ...it, uploading: false, error: "Erro ao enviar." } : it))
          );
        }
      })
    );
  }

  function removeItem(tempId: string) {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  }

  function updateDocType(tempId: string, docType: string) {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, docType } : it)));
  }

  const anyUploading = items.some((it) => it.uploading);

  // Avisa o botão de Salvar (SaveCaseButton.tsx) se ainda há upload em andamento — sem isso, o
  // usuário podia clicar Salvar com anexos ainda subindo pro Blob e o caso era criado só com os
  // que já tinham terminado a tempo, silenciosamente, sem nenhum erro visível (bug real relatado:
  // "juntei vários documentos... só subiram 3"). Evento de DOM, não Context, pro botão continuar
  // um componente simples e desacoplado — mesmo espírito do listener de "type" que ele já tem.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    form?.dispatchEvent(new CustomEvent("lumen:attachments-uploading", { detail: { uploading: anyUploading } }));
  }, [anyUploading]);

  const payload: StagedCaseAttachment[] = items
    .filter((it) => it.blobUrl && !it.error)
    .map((it) => ({ blobUrl: it.blobUrl as string, name: it.name, contentType: it.contentType, docType: it.docType }));

  return (
    <div ref={rootRef}>
      <label className="text-xs font-medium text-tx-2">Anexos (opcional)</label>
      <input type="hidden" name="stagedAttachments" value={JSON.stringify(payload)} />

      {!driveConnected && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg px-2.5 py-1.5">
          Drive ainda não conectado. Peça a um administrador para conectar em Configurações — depois de criar o caso, você
          ainda pode anexar documentos na aba Anexos.
        </p>
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
          className={`mt-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
            dragOver
              ? "border-acao bg-acao-bg"
              : "border-regua hover:border-acao/40 hover:bg-sf-apoio"
          }`}
        >
          <UploadCloud size={18} className="text-tx-3" />
          <p className="text-xs text-tx-2 text-center">
            Arraste arquivos aqui, ou clique para selecionar — já ficam anexados ao salvar
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
        <div className="mt-2 space-y-1.5">
          {items.map((it) => (
            <div
              key={it.tempId}
              className="flex items-center gap-2 rounded-lg border border-regua bg-sf-apoio px-2.5 py-1.5"
            >
              <span className="text-xs font-medium text-tx truncate flex-1" title={it.name}>
                {it.name}
              </span>
              {it.uploading ? (
                <Loader2 size={13} className="animate-spin text-tx-3 shrink-0" />
              ) : it.error ? (
                <span className="text-[10px] text-red-600 dark:text-red-400 shrink-0">{it.error}</span>
              ) : (
                <DocumentTypeSelect
                  value={it.docType}
                  onChange={(v) => updateDocType(it.tempId, v)}
                  className="text-[11px] border border-regua bg-sf text-tx rounded px-1.5 py-1 max-w-[170px] shrink-0"
                  allowCreate
                />
              )}
              <button
                type="button"
                onClick={() => removeItem(it.tempId)}
                className="p-1 text-tx-3 hover:text-red-600 dark:hover:text-red-400 shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {anyUploading && (
        <p className="text-[11px] text-tx-3 mt-1">
          Enviando anexo(s)... o botão de salvar fica bloqueado até terminar, pra nenhum arquivo ficar de fora.
        </p>
      )}
    </div>
  );
}
