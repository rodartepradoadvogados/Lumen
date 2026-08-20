"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Workflow } from "lucide-react";
import { applyWorkflowToCase } from "@/lib/actions/workflows";
import ModalShell from "@/components/ModalShell";

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
        className="flex items-center gap-1.5 bg-sf border border-regua hover:bg-sf-apoio text-tx text-sm font-medium px-3.5 py-2 transition-colors disabled:opacity-50"
      >
        <Workflow size={16} /> Aplicar Workflow
      </button>

      {open && (
        // "medio": é uma escolha de 2 campos (workflow + responsável padrão), não um formulário
        // de lançamento — 80% da tela deixaria a janela quase vazia.
        <ModalShell size="medio" title="Aplicar Workflow" onClose={() => setOpen(false)}>
          <form action={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              <p className="text-xs text-tx-2">
                As tarefas do workflow serão criadas neste processo, com prazos contados a partir de hoje.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-tx-2">Workflow</label>
                  <select
                    name="templateId"
                    required
                    className="w-full mt-1 border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-acao/40"
                    defaultValue=""
                  >
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
                  <label className="text-xs font-medium text-tx-2">Responsável padrão</label>
                  <select
                    name="responsibleId"
                    className="w-full mt-1 border border-regua bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-acao/40"
                    defaultValue=""
                  >
                    <option value="">Não definido</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-tx-3">
                Passos com cargo definido tentam usar o membro correspondente; caso contrário, usam este responsável.
              </p>
              {error && (
                <p className="text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border border-red-200 dark:border-red-400/30 px-2.5 py-1.5">
                  {error}
                </p>
              )}
            </div>
            <div className="shrink-0 border-t border-regua px-5 py-3 flex justify-end bg-sf-apoio">
              <button
                type="submit"
                disabled={pending}
                className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold px-5 py-2 transition-colors disabled:opacity-50"
              >
                {pending ? "Aplicando..." : "Aplicar workflow"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}
