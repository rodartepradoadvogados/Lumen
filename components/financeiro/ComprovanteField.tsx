"use client";

import { useRef } from "react";
import { Paperclip, FileText, X } from "lucide-react";

// Campo de anexo do comprovante de pagamento/recebimento — usado nos quatro modais de Contas a
// Pagar/Receber (Novo/Editar) e nos formulários mobile equivalentes. O upload em si é sempre
// feito pelo componente PAI (via lib/financeReceiptUpload.ts), depois que a conta já existe
// (create* devolve o id; edit* já tem um) — este componente só junta o File escolhido no estado
// do formulário e mostra o comprovante já salvo (Editar) ou o que acabou de ser escolhido (ainda
// não enviado). Ver app/api/financeiro/comprovante/upload/route.ts para o endpoint real.
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

  return (
    <div>
      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Comprovante</label>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        {existingUrl && !file && (
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gold-700 dark:text-gold-400 hover:underline bg-gold-500/10 rounded-lg px-2.5 py-1.5 max-w-full truncate"
          >
            <FileText size={13} className="shrink-0" /> <span className="truncate">{existingName || "Ver comprovante"}</span>
          </a>
        )}
        {file && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-800/80 dark:text-cream-50/80 bg-cream-100 dark:bg-white/10 rounded-lg px-2.5 py-1.5 max-w-full">
            <FileText size={13} className="shrink-0" /> <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-navy-800/40 dark:text-cream-50/40 hover:text-bordo-600 dark:hover:text-bordo-400 shrink-0"
            >
              <X size={12} />
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-navy-800/15 dark:border-white/15 text-navy-800/70 dark:text-cream-50/70 hover:bg-cream-100 dark:hover:bg-white/10 shrink-0"
        >
          <Paperclip size={13} /> {existingUrl || file ? "Substituir comprovante" : "Anexar comprovante"}
        </button>
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
