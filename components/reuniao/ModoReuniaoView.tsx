"use client";

import { Printer, X } from "lucide-react";
import { taskTypeLabels, formatCalendarDate } from "@/components/ui";
import CaseTimeline from "@/components/processos/CaseTimeline";
import type { CaseTimelineEvent } from "@/lib/caseTimeline";

// Vista de impressão/apresentação do processo, para abrir numa aba à parte e mostrar ao
// cliente numa reunião (projetada ou impressa em papel) — ver proposta de remodelação do
// portal, "Modo reunião". Sem rail/painel de seção/TopBar (app/reuniao/[id]/page.tsx já
// renderiza fora da casca do app), com uma folha de estilo própria via print: do Tailwind:
// os controles (Imprimir/Fechar) somem no papel, o conteúdo vira preto sobre branco.
export default function ModoReuniaoView({
  officeName,
  caseTitle,
  processNumber,
  naturezaLabel,
  court,
  tribunal,
  responsibleName,
  status,
  clients,
  parties,
  pendingTasks,
  timelineEvents,
}: {
  officeName: string;
  caseTitle: string;
  processNumber: string | null;
  naturezaLabel: string;
  court: string | null;
  tribunal: string | null;
  responsibleName: string | null;
  status: string;
  clients: { name: string; role: string | null }[];
  parties: { name: string; role: string | null }[];
  pendingTasks: { id: string; title: string; type: string; dueDate: string }[];
  timelineEvents: CaseTimelineEvent[];
}) {
  const generatedAt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-sf-fundo print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 bg-sf border-b border-regua">
        <p className="text-sm font-semibold text-tx">Modo reunião</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-4 py-2 transition-colors"
          >
            <Printer size={15} /> Imprimir
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 border border-regua text-tx font-semibold text-sm px-4 py-2 hover:bg-sf-apoio transition-colors"
          >
            <X size={15} /> Fechar
          </button>
        </div>
      </div>

      <div className="max-w-[860px] mx-auto px-6 py-10 print:p-0 print:max-w-none">
        <div className="flex items-baseline justify-between border-b-2 border-atencao print:border-black pb-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-tx-2 print:text-black">{officeName}</p>
            <h1 className=" text-3xl font-bold text-tx print:text-black mt-1">{caseTitle}</h1>
          </div>
          <p className="text-xs text-tx-2 print:text-black shrink-0 ml-4">Gerado em {generatedAt}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-8">
          <div className="space-y-6">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-tx-2 print:text-black mb-2">Dados do processo</h2>
              <dl className="text-sm space-y-1.5 text-tx print:text-black">
                {processNumber && (
                  <div className="flex gap-2">
                    <dt className="text-tx-2 print:text-black/60 shrink-0">Nº do processo:</dt>
                    <dd className="font-medium">{processNumber}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-tx-2 print:text-black/60 shrink-0">Natureza:</dt>
                  <dd className="font-medium">{naturezaLabel}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-tx-2 print:text-black/60 shrink-0">Situação:</dt>
                  <dd className="font-medium">{status}</dd>
                </div>
                {court && (
                  <div className="flex gap-2">
                    <dt className="text-tx-2 print:text-black/60 shrink-0">Vara/Comarca:</dt>
                    <dd className="font-medium">{court}</dd>
                  </div>
                )}
                {tribunal && (
                  <div className="flex gap-2">
                    <dt className="text-tx-2 print:text-black/60 shrink-0">Tribunal/Órgão:</dt>
                    <dd className="font-medium">{tribunal}</dd>
                  </div>
                )}
                {responsibleName && (
                  <div className="flex gap-2">
                    <dt className="text-tx-2 print:text-black/60 shrink-0">Advogado responsável:</dt>
                    <dd className="font-medium">{responsibleName}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-tx-2 print:text-black mb-2">Partes</h2>
              <div className="text-sm space-y-1 text-tx print:text-black">
                {clients.map((cl, i) => (
                  <p key={i}>
                    <span className="text-tx-2 print:text-black/60">{clients.length > 1 ? `Cliente ${i + 1}: ` : "Cliente: "}</span>
                    {cl.name}
                    {cl.role ? ` (${cl.role})` : ""}
                  </p>
                ))}
                {parties.map((p, i) => (
                  <p key={i}>
                    <span className="text-tx-2 print:text-black/60">{parties.length > 1 ? `Parte ${i + 1}: ` : "Parte adversa: "}</span>
                    {p.name}
                    {p.role ? ` (${p.role})` : ""}
                  </p>
                ))}
              </div>
            </section>

            {pendingTasks.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-tx-2 print:text-black mb-2">
                  Próximos passos
                </h2>
                <ul className="text-sm space-y-1.5 text-tx print:text-black">
                  {pendingTasks.map((t) => (
                    <li key={t.id} className="flex items-baseline gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-atencao print:text-black/60 shrink-0">
                        {taskTypeLabels[t.type] ?? t.type}
                      </span>
                      <span className="font-medium">{t.title}</span>
                      <span className="text-tx-2 print:text-black/50 text-xs ml-auto shrink-0">
                        {formatCalendarDate(t.dueDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <section className="border-t md:border-t-0 md:border-l border-regua print:border-black/20 pt-6 md:pt-0 md:pl-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-tx-2 print:text-black mb-3">Linha do tempo</h2>
            <div className="print:text-black">
              <CaseTimeline events={timelineEvents} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
