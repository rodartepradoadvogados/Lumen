"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAnotacao } from "@/lib/actions/anotacoes";
import { EmptyState, formatDate, formatCalendarDate } from "@/components/ui";

export type AnotacaoListItem = { id: string; content: string; referenceDate: string; createdAt: string };

// Lista de leitura das anotações pessoais já salvas para uma entidade (Processo/Caso, Atendimento
// ou Assessoria) — a CRIAÇÃO em si acontece só pelo painel global "Anotações" (faixa retrátil na
// borda direita, ver components/anotacoes/AnotacoesPanel.tsx), nunca por aqui. Reaproveitado
// também pelas páginas de detalhe mobile (leitura), ver app/m/.../[id]/page.tsx.
export default function AnotacoesPessoaisList({ anotacoes }: { anotacoes: AnotacaoListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!window.confirm("Excluir esta anotação?")) return;
    startTransition(async () => {
      await deleteAnotacao(id);
      router.refresh();
    });
  }

  if (anotacoes.length === 0) {
    return (
      <EmptyState
        title="Nenhuma anotação pessoal ainda"
        subtitle="Abra o painel Anotações (ícone na borda direita da tela) para criar uma vinculada a este item"
      />
    );
  }

  return (
    <div className="space-y-3">
      {anotacoes.map((a) => (
        <div key={a.id} className="rounded-xl border border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold text-gold-700 dark:text-gold-400">Consignada em {formatCalendarDate(a.referenceDate)}</span>
            <button
              type="button"
              onClick={() => handleDelete(a.id)}
              disabled={pending}
              data-tip="Excluir"
              className="p-1 rounded text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-500/10 dark:hover:bg-bordo-400/10 transition-colors disabled:opacity-40"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div
            className="anotacao-content text-sm text-navy-800 dark:text-cream-50/85 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: a.content }}
          />
          <p className="mt-2 text-[10px] text-navy-800/35 dark:text-cream-50/35">Criada em {formatDate(a.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}
