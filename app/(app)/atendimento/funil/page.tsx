import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Badge, formatCurrency } from "@/components/ui";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import { ColunasRecolhiveis, ColunaRecolhivel } from "@/components/atendimento/ColunasRecolhiveis";
// stageLabels vem do módulo neutro, nunca do componente "use client" — ver lib/funil.ts.
import { stageOptions as STAGES, stageLabels, stageDot } from "@/lib/funil";
import { List } from "lucide-react";
import { veTodoOAtendimento, whereDoAtendimento } from "@/lib/acessoAtendimento";

export const dynamic = "force-dynamic";

const leadSourceLabels: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function FunilPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // O funil é do escritório inteiro: só quem vê todo o Atendimento (lib/acessoAtendimento.ts).
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
    <div className="tela">
      <PageHeader
        title="Funil Comercial"
        subtitle="Acompanhamento da captação de novos clientes por estágio"
        action={
          <Link
            href="/atendimento"
            className="inline-flex items-center gap-1.5 bg-sf text-tx-2 border border-regua hover:bg-sf-apoio text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <List size={16} /> Lista de Atendimentos
          </Link>
        }
      />

      <div className="mb-4">
        {conversionRate !== null && (
          <p className="text-sm text-tx-2">
            Taxa de conversão:{" "}
            <span className="font-semibold text-concluido tabular-nums">{conversionRate.toFixed(0)}%</span>{" "}
            <span className="text-xs text-tx-3">
              ({closed} fechado(s) de {closed + lost} decididos)
            </span>
          </p>
        )}
      </div>

      {/* TODAS AS COLUNAS COMEÇAM RECOLHIDAS (lib/colunasDoFunil.ts): nome e contagem à vista, cartões ao abrir. */}
      <ColunasRecolhiveis superficie="site" estagios={STAGES}>
      <div className="flex gap-4 overflow-x-auto pb-4 items-start funil-cols">
        {STAGES.map((stage) => {
          const cards = byStage[stage];
          const total = totals.find((t) => t.stage === stage)!;
          return (
            <ColunaRecolhivel
              key={stage}
              estagio={stage}
              nome={stageLabels[stage]}
              cor={stageDot[stage]}
              total={total.count}
              resumo={total.sum > 0 ? <p className="text-xs text-tx-3 mb-1.5">{formatCurrency(total.sum)} estimado</p> : undefined}
              className="w-80 shrink-0 bg-sf-apoio border border-regua flex flex-col funil-col"
              classeDoCorpo="p-2.5 space-y-2"
            >
                {cards.length === 0 ? (
                  <p className="text-xs text-center text-tx-3 py-6">Sem atendimentos neste estágio</p>
                ) : (
                  cards.map((a) => {
                    const stageSince = a.stageChangedAt ?? a.createdAt;
                    const days = daysBetween(stageSince, now);
                    const followupLate =
                      a.nextContactAt && a.nextContactAt < now && !["FECHADO", "PERDIDO"].includes(a.stage);
                    return (
                      // O filete lateral era a cor do ESTÁGIO — e o cartão já está dentro da
                      // coluna daquele estágio, com o ponto colorido no cabeçalho dela. A faixa
                      // repetia o que a coluna diz, ou seja: decoração vestida de dado. O
                      // comentário anterior a justificava por analogia ao Kanban de tarefas, mas
                      // lá o filete carrega a CATEGORIA, que a coluna não diz — aqui a analogia
                      // não se sustenta.
                      //
                      // O filete passa a marcar RISCO, que é a regra da casa ("cor = risco, nunca
                      // categoria"): fica bordô no cartão cujo follow-up venceu, que é o único do
                      // quadro sobre o qual há algo a fazer agora. Nos demais, não existe.
                      //
                      // A sombra saiu junto: a casa trocou altura por filete em F3, e cartão em
                      // fluxo dentro de uma coluna não está flutuando sobre nada.
                      <div
                        key={a.id}
                        className={`bg-sf border-2 rounded-[2px] ${
                          followupLate ? "border-urgente" : "border-regua-forte"
                        }`}
                      >
                        <Link href={`/atendimento/${a.id}`} className="block p-3 hover:bg-sf-apoio transition-colors">
                          <p className="text-corpo font-semibold text-tx leading-snug">{a.clientName}</p>
                          <p className="text-etiqueta text-tx-3 mt-0.5 line-clamp-2">{a.subject}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            {a.estimatedValue != null && a.estimatedValue > 0 && (
                              <Badge color="green">{formatCurrency(a.estimatedValue)}</Badge>
                            )}
                            {a.leadSource && <Badge color="blue">{leadSourceLabels[a.leadSource] || a.leadSource}</Badge>}
                          </div>
                          <div className="flex items-center justify-between mt-2 text-etiqueta text-tx-3">
                            <span>{days} dia(s) no estágio</span>
                            {a.responsible && <span className="truncate max-w-[45%]">{a.responsible.name}</span>}
                          </div>
                          {followupLate && (
                            <p className="text-etiqueta font-semibold text-urgente mt-1.5">follow-up atrasado</p>
                          )}
                          {a.stage === "PERDIDO" && a.lostReason && (
                            <p className="text-etiqueta text-tx-3 mt-1.5 italic">Motivo: {a.lostReason}</p>
                          )}
                        </Link>
                        <div className="px-3 pb-2.5">
                          <FunnelStageSelect attendanceId={a.id} stage={a.stage} className="w-full text-center" />
                        </div>
                      </div>
                    );
                  })
                )}
            </ColunaRecolhivel>
          );
        })}
      </div>
      </ColunasRecolhiveis>
    </div>
  );
}
