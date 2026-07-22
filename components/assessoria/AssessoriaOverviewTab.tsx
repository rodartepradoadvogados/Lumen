"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateAssessoria, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Badge, formatDate } from "@/components/ui";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

const caseStatusColors: Record<string, "green" | "slate" | "bordo" | "amber"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "slate",
};
const caseStatusLabels: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado", ARQUIVADO: "Arquivado" };

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">Próximos vencimentos</h4>
        {upcoming.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nada pendente no momento.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {upcoming.map((item, i) => (
              <div key={i} className="flex justify-between gap-3 py-2 text-sm">
                <span className="text-navy-900 dark:text-cream-50">{item.label}</span>
                <span className="text-navy-800/45 dark:text-cream-50/45 whitespace-nowrap">{formatDate(item.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">
          Processos vinculados <span className="normal-case font-medium">(filtro por cliente)</span>
        </h4>
        {assessoria.linkedCases.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum processo vinculado a esta empresa ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedCases.map((c) => (
              <Link
                key={c.id}
                href={`/processos/${c.id}`}
                className="flex justify-between gap-3 py-2 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
              >
                <span className="font-medium text-navy-900 dark:text-cream-50 underline decoration-navy-900/20 dark:decoration-cream-50/20">{c.title}</span>
                <Badge color={caseStatusColors[c.status] || "slate"}>{caseStatusLabels[c.status] || c.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">Planejamento</h4>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Anotações estratégicas para esta empresa..."
          className="w-full text-sm text-navy-800 dark:text-cream-50/85 bg-transparent border border-navy-800/10 dark:border-white/15 rounded-lg p-2 focus:outline-none focus:border-gold-500 resize-none"
        />
        {notes !== savedNotes && (
          <button
            onClick={saveNotes}
            disabled={pending}
            className="mt-2 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:text-gold-800 disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar planejamento"}
          </button>
        )}
      </div>
    </div>
  );
}
