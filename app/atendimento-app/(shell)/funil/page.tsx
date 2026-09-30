import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { whereDoAtendimento, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { formatCurrency } from "@/components/ui";
import { stageOptions as STAGES, stageLabels, stageDot } from "@/lib/funil";
import { ColunasDoFunilApp, ColunaDoFunilApp } from "@/components/atendimento-app/ColunasDoFunilApp";
import LeadDoFunil from "@/components/atendimento-app/LeadDoFunil";

export const dynamic = "force-dynamic";

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function FunilAppPage() {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  // O funil é do escritório inteiro: quem só vê os próprios leads não tem funil (mesma regra da
  // Central, aba Triagem, e do site).
  if (!veTodoOAtendimento(viewer)) notFound();

  const attendances = await prisma.attendance.findMany({
    where: { status: { notIn: ["ARQUIVADO", "RASCUNHO"] }, ...whereDoAtendimento(viewer) },
    include: { responsible: { select: { name: true } } },
    orderBy: [{ stageChangedAt: "desc" }, { createdAt: "desc" }],
  });

  const now = new Date();
  const byStage: Record<string, typeof attendances> = {};
  for (const s of STAGES) byStage[s] = [];
  for (const a of attendances) {
    const stage = STAGES.includes(a.stage) ? a.stage : "NOVO";
    byStage[stage].push(a);
  }

  const totals = STAGES.map((s) => ({
    stage: s,
    count: byStage[s].length,
    sum: byStage[s].reduce((acc, a) => acc + (a.estimatedValue || 0), 0),
  }));

  const closed = byStage["FECHADO"].length;
  const lost = byStage["PERDIDO"].length;
  const conversionRate = closed + lost > 0 ? (closed / (closed + lost)) * 100 : null;

  return (
    <div className="animate-fade-in space-y-2 pb-4">
      <div className="px-5 pt-1">
        <h1 className="text-app-nome font-bold text-tx">Funil comercial</h1>
        <p className="text-app-meta text-atd-terciario">Acompanhamento da captação por estágio</p>
      </div>

      {/* TODAS AS COLUNAS COMEÇAM RECOLHIDAS (lib/colunasDoFunil.ts): nome e contagem à vista, cartões ao abrir. */}
      <ColunasDoFunilApp
        estagios={STAGES}
        resumo={
          conversionRate !== null ? (
            <p className="text-app-meta text-atd-previa">
              Conversão <span className="font-bold tabular-nums text-concluido">{conversionRate.toFixed(0)}%</span>{" "}
              <span className="text-atd-terciario">({closed} de {closed + lost} decididos)</span>
            </p>
          ) : undefined
        }
      >
        <div className="space-y-2.5 px-4 pt-1">
          {STAGES.map((stage) => {
            const cards = byStage[stage];
            const total = totals.find((t) => t.stage === stage)!;
            return (
              <ColunaDoFunilApp
                key={stage}
                estagio={stage}
                nome={stageLabels[stage]}
                cor={stageDot[stage]}
                total={total.count}
                resumo={total.sum > 0 ? <p className="text-app-meta text-atd-previa">{formatCurrency(total.sum)} estimado</p> : undefined}
              >
                {cards.length === 0 ? (
                  <p className="px-2 py-5 text-center text-app-previa text-atd-terciario">Nenhum atendimento neste estágio.</p>
                ) : (
                  cards.map((a) => {
                    const stageSince = a.stageChangedAt ?? a.createdAt;
                    const days = daysBetween(stageSince, now);
                    const followupLate = a.nextContactAt && a.nextContactAt < now && !["FECHADO", "PERDIDO"].includes(a.stage);
                    return (
                      <LeadDoFunil
                        key={a.id}
                        lead={{
                          id: a.id,
                          clientName: a.clientName,
                          subject: a.subject,
                          stage: a.stage,
                          estimatedValue: a.estimatedValue,
                          leadSource: a.leadSource,
                          responsavel: a.responsible?.name ?? null,
                          lostReason: a.lostReason,
                          dias: days,
                          followUpAtrasado: Boolean(followupLate),
                        }}
                      />
                    );
                  })
                )}
              </ColunaDoFunilApp>
            );
          })}
        </div>
      </ColunasDoFunilApp>
    </div>
  );
}
