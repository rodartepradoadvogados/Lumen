"use client";

import { useRef, useState } from "react";
import { Paperclip, FileText, X, UploadCloud } from "lucide-react";

// Campo de anexo do comprovante de pagamento/recebimento — usado nos quatro modais de Contas a
// Pagar/Receber (Novo/Editar), no modal de Dar Baixa (SettleModal) e nos formulários mobile
// equivalentes. O upload em si é sempre feito pelo componente PAI (via
// lib/financeReceiptUpload.ts), depois que a conta já existe (create*/SettleModal devolvem ou já
// têm um id; edit* já tem um) — este componente só junta o File escolhido no estado do formulário
// e mostra o comprovante já salvo (Editar/Baixa) ou o que acabou de ser escolhido (ainda não
// enviado). Ver app/api/financeiro/comprovante/upload/route.ts para o endpoint real.
export default function ComprovanteField({
  file,
  onFileChange,
  existingUrl,
  existingName,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  existingUrl?: string | null;
  existingName?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <label className="text-xs font-medium text-tx-2">Comprovante</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onFileChange(dropped);
        }}
        className={`mt-1 flex items-center gap-2 flex-wrap border border-dashed p-2 transition-colors ${
          dragOver ? "border-marca bg-marca-bg" : "border-regua-forte"
        }`}
      >
        {existingUrl && !file && (
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-marca-tx hover:underline bg-marca-bg px-2.5 py-1.5 max-w-full truncate"
          >
            <FileText size={13} className="shrink-0" /> <span className="truncate">{existingName || "Ver comprovante"}</span>
          </a>
        )}
        {file && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-tx-2 bg-sf-apoio px-2.5 py-1.5 max-w-full">
            <FileText size={13} className="shrink-0" /> <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-tx-3 hover:text-atencao shrink-0"
            >
              <X size={12} />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 border border-regua-forte text-tx-2 hover:bg-sf-apoio shrink-0"
        >
          <Paperclip size={13} /> {existingUrl || file ? "Substituir comprovante" : "Anexar comprovante"}
        </button>
        {!file && (
          <span className="text-[11px] text-tx-3 inline-flex items-center gap-1">
            <UploadCloud size={12} /> ou arraste o arquivo aqui
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}
