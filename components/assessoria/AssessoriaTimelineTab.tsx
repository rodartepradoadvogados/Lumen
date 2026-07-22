import Link from "next/link";
import type { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { formatDate } from "@/components/ui";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

type TimelineEvent = { date: Date; title: string; desc: string; color: string };

function buildTimeline(assessoria: Assessoria): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const d of assessoria.documents) {
    events.push({ date: d.createdAt, title: "Documento adicionado", desc: d.name, color: "#b8860b" });
  }
  for (const h of assessoria.honorarios) {
    if (h.receivable.status === "PAGO" && h.receivable.paidDate) {
      events.push({ date: h.receivable.paidDate, title: `Honorário de ${h.competencia} pago`, desc: `Recibo${h.receivable.paymentReceiptNumber ? ` ${h.receivable.paymentReceiptNumber}` : ""} anexado`, color: "#1f7a4d" });
    }
  }
  for (const l of assessoria.licitacoes) {
    events.push({ date: l.createdAt, title: `${l.objeto} — cadastrada`, desc: l.modalidade || l.orgao, color: "#6e0d25" });
  }
  for (const c of assessoria.linkedCases) {
    if (c.lastHistoryAt && c.lastHistoryDesc) {
      events.push({ date: c.lastHistoryAt, title: `Movimentação em ${c.title}`, desc: c.lastHistoryDesc, color: "#1a2647" });
    }
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20);
}

export default function AssessoriaTimelineTab({ assessoria }: { assessoria: Assessoria }) {
  const events = buildTimeline(assessoria);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-3">Histórico</h4>
        {events.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Ainda não há nada registrado.</p>
        ) : (
          <div className="space-y-3.5">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-navy-800/10 dark:bg-white/10 mt-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 tabular-nums">{formatDate(e.date)}</p>
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{e.title}</p>
                  <p className="text-xs text-navy-800/55 dark:text-cream-50/55">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">Planejamento</h4>
        {assessoria.planningNotes ? (
          <p className="text-sm text-navy-800/70 dark:text-cream-50/70 italic whitespace-pre-wrap">{assessoria.planningNotes}</p>
        ) : (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhuma anotação ainda.</p>
        )}
        <Link href={`/assessoria/${assessoria.id}?tab=geral`} className="inline-block mt-2 text-xs font-semibold text-gold-700 dark:text-gold-400">
          Editar em Visão Geral →
        </Link>
      </div>
    </div>
  );
}
