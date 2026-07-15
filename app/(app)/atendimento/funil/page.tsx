import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, formatCurrency } from "@/components/ui";
import FunnelStageSelect, { stageLabels } from "@/components/FunnelStageSelect";
import { List } from "lucide-react";

export const dynamic = "force-dynamic";

const STAGES = ["NOVO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];

const stageDot: Record<string, string> = {
  NOVO: "#f59e0b",
  QUALIFICACAO: "#3b82f6",
  PROPOSTA: "#c6a05c",
  FECHADO: "#10b981",
  PERDIDO: "#ef4444",
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

export default async function FunilPage() {
  const attendances = await prisma.attendance.findMany({
    where: { status: { not: "ARQUIVADO" } },
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
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader
        title="Funil Comercial"
        subtitle="Acompanhamento da captação de novos clientes por estágio"
        action={
          <Link
            href="/atendimento"
            className="inline-flex items-center gap-1.5 bg-white text-navy-800/70 border border-navy-800/10 hover:bg-cream-100 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
          >
            <List size={16} /> Lista de Atendimentos
          </Link>
        }
      />

      <div className="mb-4">
        {conversionRate !== null && (
          <p className="text-sm text-navy-800/60">
            Taxa de conversão:{" "}
            <span className="font-semibold text-emerald-700">{conversionRate.toFixed(0)}%</span>{" "}
            <span className="text-xs text-navy-800/40">
              ({closed} fechado(s) de {closed + lost} decididos)
            </span>
          </p>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {STAGES.map((stage) => {
          const cards = byStage[stage];
          const total = totals.find((t) => t.stage === stage)!;
          return (
            <div key={stage} className="w-80 shrink-0 rounded-xl bg-cream-100/70 border border-navy-800/8 flex flex-col">
              <div className="px-4 py-3 border-b border-navy-800/8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageDot[stage] }} />
                    <h3 className="font-semibold text-sm text-navy-900">{stageLabels[stage]}</h3>
                  </div>
                  <span className="text-xs font-semibold text-navy-800/40 bg-white rounded-full px-2 py-0.5">{total.count}</span>
                </div>
                {total.sum > 0 && (
                  <p className="text-xs text-navy-800/50 mt-1">{formatCurrency(total.sum)} estimado</p>
                )}
              </div>
              <div className="p-2.5 space-y-2">
                {cards.length === 0 ? (
                  <p className="text-xs text-center text-navy-800/30 py-6">Sem atendimentos neste estágio</p>
                ) : (
                  cards.map((a) => {
                    const stageSince = a.stageChangedAt ?? a.createdAt;
                    const days = daysBetween(stageSince, now);
                    const followupLate =
                      a.nextContactAt && a.nextContactAt < now && !["FECHADO", "PERDIDO"].includes(a.stage);
                    return (
                      <div key={a.id} className="bg-white rounded-lg border border-navy-800/8 shadow-card">
                        <Link href={`/atendimento/${a.id}`} className="block p-3 hover:bg-cream-50 rounded-t-lg transition-colors">
                          <p className="text-sm font-medium text-navy-900 leading-snug">{a.clientName}</p>
                          <p className="text-xs text-navy-800/45 mt-0.5 line-clamp-2">{a.subject}</p>
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            {a.estimatedValue != null && a.estimatedValue > 0 && (
                              <Badge color="green">{formatCurrency(a.estimatedValue)}</Badge>
                            )}
                            {a.leadSource && <Badge color="navy">{leadSourceLabels[a.leadSource] || a.leadSource}</Badge>}
                          </div>
                          <div className="flex items-center justify-between mt-2 text-[11px] text-navy-800/45">
                            <span>{days} dia(s) no estágio</span>
                            {a.responsible && <span className="truncate max-w-[45%]">{a.responsible.name}</span>}
                          </div>
                          {followupLate && (
                            <p className="text-[11px] font-semibold text-red-600 mt-1.5">follow-up atrasado</p>
                          )}
                          {a.stage === "PERDIDO" && a.lostReason && (
                            <p className="text-[11px] text-navy-800/40 mt-1.5 italic">Motivo: {a.lostReason}</p>
                          )}
                        </Link>
                        <div className="px-3 pb-2.5">
                          <FunnelStageSelect attendanceId={a.id} stage={a.stage} className="w-full text-center" />
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
