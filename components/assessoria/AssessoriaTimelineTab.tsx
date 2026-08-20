import Link from "next/link";
import type { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { formatDate } from "@/components/ui";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

type TimelineEvent = { date: Date; title: string; desc: string; color: string };

// `color` é sempre uma referência a variável CSS (var(--token), ver app/globals.css) — nunca um
// hex cravado (DESIGN-SYSTEM.md §0/§16). Documento/licitação cadastrados usam --marca-tx (ouro,
// mesmo espírito de "Cadastrado no Lúmen"/"Documento gerado" em CaseTimeline.tsx), honorário pago
// usa --concluido, e movimentação de processo fica neutra (--tx-2).
function buildTimeline(assessoria: Assessoria): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const d of assessoria.documents) {
    events.push({ date: d.createdAt, title: "Documento adicionado", desc: d.name, color: "var(--marca-tx)" });
  }
  for (const h of assessoria.honorarios) {
    if (h.receivable.status === "PAGO" && h.receivable.paidDate) {
      events.push({ date: h.receivable.paidDate, title: `Honorário de ${h.competencia} pago`, desc: `Recibo${h.receivable.paymentReceiptNumber ? ` ${h.receivable.paymentReceiptNumber}` : ""} anexado`, color: "var(--concluido)" });
    }
  }
  for (const l of assessoria.licitacoes) {
    events.push({ date: l.createdAt, title: `${l.objeto} — cadastrada`, desc: l.modalidade || l.orgao, color: "var(--marca-tx)" });
  }
  for (const c of assessoria.linkedCases) {
    if (c.lastHistoryAt && c.lastHistoryDesc) {
      events.push({ date: c.lastHistoryAt, title: `Movimentação em ${c.title}`, desc: c.lastHistoryDesc, color: "var(--tx-2)" });
    }
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20);
}

export default function AssessoriaTimelineTab({ assessoria }: { assessoria: Assessoria }) {
  const events = buildTimeline(assessoria);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-sf border border-regua p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-3">Histórico</h4>
        {events.length === 0 ? (
          <p className="text-sm text-tx-3">Ainda não há nada registrado.</p>
        ) : (
          <div className="space-y-3.5">
            {events.map((e, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-regua mt-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-[11px] text-tx-3 tabular-nums">{formatDate(e.date)}</p>
                  <p className="text-sm font-semibold text-tx">{e.title}</p>
                  <p className="text-xs text-tx-2">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-sf border border-regua p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2.5">Planejamento</h4>
        {assessoria.planningNotes ? (
          <p className="text-sm text-tx-2 italic whitespace-pre-wrap">{assessoria.planningNotes}</p>
        ) : (
          <p className="text-sm text-tx-3">Nenhuma anotação ainda.</p>
        )}
        <Link href={`/assessoria/${assessoria.id}?tab=geral`} className="inline-block mt-2 text-xs font-semibold text-acao hover:text-acao-hover">
          Editar em Visão Geral →
        </Link>
      </div>
    </div>
  );
}
