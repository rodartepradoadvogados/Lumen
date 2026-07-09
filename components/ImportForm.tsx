"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Upload } from "lucide-react";
import type { ImportResult } from "@/lib/actions/import";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
    >
      <Upload size={15} /> {pending ? "Importando..." : label}
    </button>
  );
}

export default function ImportForm({
  action,
  label,
  hint,
}: {
  action: (prevState: ImportResult, formData: FormData) => Promise<ImportResult>;
  label: string;
  hint: string;
}) {
  const [state, formAction] = useFormState(action, { created: 0, skipped: 0, errors: [] });

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-navy-800/50">{hint}</p>
      <input
        type="file"
        name="file"
        accept=".xlsx,.xls,.csv"
        required
        className="block w-full text-sm text-navy-800 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-cream-100 file:text-navy-800 file:text-sm hover:file:bg-cream-200"
      />
      <SubmitButton label={label} />
      {(state.created > 0 || state.skipped > 0 || state.errors.length > 0) && (
        <div className="text-sm space-y-1 pt-2 border-t border-navy-800/8">
          <p className="text-emerald-700 font-medium">{state.created} registro(s) importado(s) com sucesso</p>
          {state.skipped > 0 && <p className="text-navy-800/50">{state.skipped} linha(s) ignorada(s) (sem dado obrigatório)</p>}
          {state.errors.length > 0 && (
            <div className="text-red-600">
              <p className="font-medium">{state.errors.length} erro(s):</p>
              <ul className="list-disc list-inside max-h-32 overflow-y-auto scrollbar-thin">
                {state.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
