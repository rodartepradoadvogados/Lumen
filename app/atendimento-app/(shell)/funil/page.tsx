import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { whereDoAtendimento, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { Badge, formatCurrency } from "@/components/ui";
import EstagioDoLeadSelect from "@/components/atendimento/EstagioDoLeadSelect";

export const dynamic = "force-dynamic";

const STAGES = ["NOVO", "QUALIFICACAO", "PROPOSTA", "AGUARDANDO_RESPOSTA", "FECHADO", "PERDIDO"];

const stageLabels: Record<string, string> = {
  NOVO: "Novo",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  AGUARDANDO_RESPOSTA: "Aguardando Resposta",
  FECHADO: "Fechado",
  PERDIDO: "Recusado",
};

const stageDot: Record<string, string> = {
  NOVO: "var(--tx-3)",
  QUALIFICACAO: "var(--acao)",
  PROPOSTA: "var(--aviso)",
  AGUARDANDO_RESPOSTA: "var(--ouro-acento)",
  FECHADO: "var(--concluido)",
  PERDIDO: "var(--urgente)",
};

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
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-tx">Funil Comercial</h1>
        <p className="text-sm text-tx-2">Acompanhamento da captação por estágio</p>
      </div>

      <div className="mb-4">
        {conversionRate !== null && (
          <p className="text-sm text-tx-2">
            Taxa de conversão:{" "}
            <span className="font-semibold text-concluido tabular-nums">{conversionRate.toFixed(0)}%</span>{" "}
            <span className="text-xs text-tx-3">({closed} fechado(s) de {closed + lost} decididos)</span>
          </p>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 items-start funil-cols-app">
        {STAGES.map((stage) => {
          const cards = byStage[stage];
          const total = totals.find((t) => t.stage === stage)!;
          return (
            <div key={stage} className="w-full min-w-[280px] shrink-0 bg-sf-apoio border border-regua rounded-[2px] flex flex-col funil-col-app">
              <div className="px-4 py-3 border-b border-regua">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageDot[stage] }} />
                    <h3 className="font-semibold text-sm text-tx">{stageLabels[stage]}</h3>
                  </div>
                  <span className="text-xs font-semibold text-tx-2 bg-sf border border-regua rounded-full px-2 py-0.5">{total.count}</span>
                </div>
                {total.sum > 0 && <p className="text-xs text-tx-3 mt-1">{formatCurrency(total.sum)} estimado</p>}
              </div>
              <div className="p-2.5 space-y-2 flex-1 overflow-y-auto">
                {cards.length === 0 ? (
                  <p className="text-xs text-center text-tx-3 py-6">Sem atendimentos neste estágio</p>
                ) : (
                  cards.map((a) => {
                    const stageSince = a.stageChangedAt ?? a.createdAt;
                    const days = daysBetween(stageSince, now);
                    const followupLate = a.nextContactAt && a.nextContactAt < now && !["FECHADO", "PERDIDO"].includes(a.stage);
                    return (
                      <div key={a.id} className={`bg-sf border-2 rounded-[2px] ${followupLate ? "border-urgente" : "border-regua-forte"}`}>
                        <Link href={`/atendimento-app/${a.id}`} className="block p-3 hover:bg-sf-apoio transition-colors">
                          <p className="text-corpo font-semibold text-tx leading-snug">{a.clientName}</p>
                          <p className="text-etiqueta text-tx-3 mt-0.5 line-clamp-2">{a.subject}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            {a.estimatedValue != null && a.estimatedValue > 0 && <Badge color="green">{formatCurrency(a.estimatedValue)}</Badge>}
                            {a.leadSource && <Badge color="blue">{leadSourceLabels[a.leadSource] || a.leadSource}</Badge>}
                          </div>
                          <div className="flex items-center justify-between mt-2 text-etiqueta text-tx-3">
                            <span>{days} dia(s) no estágio</span>
                            {a.responsible && <span className="truncate max-w-[45%]">{a.responsible.name}</span>}
                          </div>
                          {followupLate && <p className="text-etiqueta font-semibold text-urgente mt-1.5">follow-up atrasado</p>}
                          {a.stage === "PERDIDO" && a.lostReason && <p className="text-etiqueta text-tx-3 mt-1.5 italic">Motivo: {a.lostReason}</p>}
                        </Link>
                        <div className="px-3 pb-2.5">
                          <EstagioDoLeadSelect
                            atendimentoId={a.id}
                            estagioAtual={a.stage}
                            opcoes={STAGES.map((s) => ({ valor: s, rotulo: stageLabels[s] }))}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}