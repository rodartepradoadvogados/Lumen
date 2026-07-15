"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Workflow, X } from "lucide-react";
import { applyWorkflowToCase } from "@/lib/actions/workflows";

type Option = { id: string; name: string };

export default function ApplyWorkflowModal({
  caseId,
  templates,
  users,
}: {
  caseId: string;
  templates: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    const templateId = String(formData.get("templateId") || "");
    const responsibleId = String(formData.get("responsibleId") || "");
    if (!templateId) {
      setError("Selecione um workflow.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await applyWorkflowToCase(caseId, templateId, responsibleId);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={templates.length === 0}
        title={templates.length === 0 ? "Nenhum workflow ativo cadastrado" : undefined}
        className="flex items-center gap-1.5 bg-white border border-navy-800/15 hover:bg-cream-100 text-navy-900 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        <Workflow size={16} /> Aplicar Workflow
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Aplicar Workflow</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form action={handleSubmit} className="p-5 space-y-3">
              <p className="text-xs text-navy-800/55">
                As tarefas do workflow serão criadas neste processo, com prazos contados a partir de hoje.
              </p>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Workflow</label>
                <select name="templateId" required className="w-full mt-1 border border-navy-800/10 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40" defaultValue="">
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Responsável padrão</label>
                <select name="responsibleId" className="w-full mt-1 border border-navy-800/10 rounded-lg px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40" defaultValue="">
                  <option value="">Não definido</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-navy-800/40 mt-1">
                  Passos com cargo definido tentam usar o membro correspondente; caso contrário, usam este responsável.
                </p>
              </div>
              {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {pending ? "Aplicando..." : "Aplicar workflow"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
