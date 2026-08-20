"use client";

import { useState, useTransition } from "react";
import { updateAssessoria, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { formatDate } from "@/components/ui";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

function buildUpcoming(assessoria: Assessoria) {
  const items: { label: string; date: Date }[] = [];
  const pendingHonorario = assessoria.honorarios.find((h) => h.receivable.status === "PENDENTE" || h.receivable.status === "ATRASADO");
  if (pendingHonorario) items.push({ label: `Honorário de ${pendingHonorario.competencia}`, date: pendingHonorario.receivable.dueDate });
  for (const l of assessoria.licitacoes) {
    if (l.prazoFinal && (l.status === "EM_ANALISE" || l.status === "PARTICIPANDO")) {
      items.push({ label: `${l.objeto.slice(0, 40)} — prazo final`, date: l.prazoFinal });
    }
  }
  for (const l of assessoria.licitacoes) {
    for (const t of l.tasks) {
      if (t.status !== "CONCLUIDO" && t.status !== "CANCELADO") items.push({ label: t.title, date: t.dueDate });
    }
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
}

export default function AssessoriaOverviewTab({ assessoria }: { assessoria: Assessoria }) {
  const [notes, setNotes] = useState(assessoria.planningNotes || "");
  const [savedNotes, setSavedNotes] = useState(assessoria.planningNotes || "");
  const [pending, startTransition] = useTransition();
  const upcoming = buildUpcoming(assessoria);

  function saveNotes() {
    startTransition(async () => {
      await updateAssessoria(assessoria.id, { planningNotes: notes });
      setSavedNotes(notes);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-sf border border-regua p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Próximos vencimentos</h4>
        {upcoming.length === 0 ? (
          <p className="text-sm text-tx-3">Nada pendente no momento.</p>
        ) : (
          <div className="divide-y divide-regua">
            {upcoming.map((item, i) => (
              <div key={i} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-tx">{item.label}</span>
                <span className="text-tx-2 whitespace-nowrap">{formatDate(item.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-sf border border-regua p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Planejamento</h4>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Anotações estratégicas para esta empresa..."
          className="w-full text-sm text-tx bg-transparent border border-regua-forte p-2 focus:outline-none focus:border-acao resize-none"
        />
        {notes !== savedNotes && (
          <button
            onClick={saveNotes}
            disabled={pending}
            className="mt-2 text-xs font-semibold text-acao hover:text-acao-hover disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar planejamento"}
          </button>
        )}
      </div>
    </div>
  );
}
