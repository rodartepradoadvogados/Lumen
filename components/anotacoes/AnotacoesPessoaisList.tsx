"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAnotacao } from "@/lib/actions/anotacoes";
import { EmptyState, formatCalendarDate } from "@/components/ui";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";

export type AnotacaoListItem = { id: string; content: string; referenceDate: string; createdAt: string };

// Lista de leitura das anotações pessoais já salvas para uma entidade (Processo/Caso, Atendimento
// ou Assessoria) — a CRIAÇÃO em si acontece só pelo painel global "Anotações" (faixa retrátil na
// borda direita, ver components/anotacoes/AnotacoesPanel.tsx), nunca por aqui. Reaproveitado
// também pelas páginas de detalhe mobile (leitura), ver app/m/.../[id]/page.tsx.
export default function AnotacoesPessoaisList({ anotacoes }: { anotacoes: AnotacaoListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleDelete(id: string) {
    if (!window.confirm("Excluir esta anotação?")) return;
    setError("");
    startTransition(async () => {
      const result = await deleteAnotacao(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
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
      {error && <p className="text-etiqueta text-urgente">{error}</p>}
      {anotacoes.map((a) => (
        <div key={a.id} className="border-t-2 border-regua-forte bg-sf p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-etiqueta font-semibold text-marca-tx">Consignada em {formatCalendarDate(a.referenceDate)}</span>
            <button
              type="button"
              onClick={() => handleDelete(a.id)}
              disabled={pending}
              data-tip="Excluir"
              className="p-1 rounded text-tx-3 hover:text-atencao hover:bg-grave-bg transition-colors disabled:opacity-40"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div
            className="anotacao-content text-sm text-tx-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1"
            // a.content é HTML de anotação já sanitizado por sanitizeAnotacaoHtml
            // (lib/anotacoes.ts) no único ponto de escrita, antes de chegar ao banco.
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: a.content }}
          />
          {/* createdAt é o instante da criação, não um dia de calendário escolhido (esse é
              referenceDate, acima) — formatDate() lia sem fuso e virava um dia errado perto da
              meia-noite; dataDeBrasilia() força o fuso do escritório. */}
          <p className="mt-2 text-etiqueta text-tx-3">Criada em {dataDeBrasilia(a.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}
