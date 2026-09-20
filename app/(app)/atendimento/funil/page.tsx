import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Badge, formatCurrency } from "@/components/ui";
import FunnelStageSelect from "@/components/FunnelStageSelect";
// stageLabels vem do módulo neutro, nunca do componente "use client" — ver lib/funil.ts.
import { stageLabels } from "@/lib/funil";
import { List } from "lucide-react";
import { veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { quemEstaEsperando } from "@/lib/esperaDoAtendimento";
import FilaDeEspera from "@/components/atendimento/FilaDeEspera";

export const dynamic = "force-dynamic";

const STAGES = ["NOVO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];

// Cores lidas das variáveis CSS (app/globals.css) — nenhum hex cravado aqui (DESIGN-SYSTEM.md §16).
// Remapeado por significado, não por posição — mesmo mapa da seção "Funil Comercial" de
// Relatórios: Novo = neutro (ainda sem opinião), Qualificação = --acao (em andamento), Proposta =
// --aviso (aguardando decisão do cliente), Fechado = --concluido, Perdido = --urgente.
const stageDot: Record<string, string> = {
  NOVO: "var(--tx-3)",
  QUALIFICACAO: "var(--acao)",
  PROPOSTA: "var(--aviso)",
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

export default async function FunilPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // A REGRA DO DONO: o Atendimento é de administrador e da recepção, e de mais ninguém.
  // `notFound` e não uma tela de "sem permissão": quem não pode ver não precisa saber que existe.
  // O FUNIL É DE QUEM ORGANIZA A CAPTAÇÃO, e não de quem atende um caso. Ele mostra o pipeline
  // comercial do escritório inteiro — valor estimado, o que foi perdido e por quê. Recortá-lo por
  // dono daria a um advogado uma "visão de funil" de três cartões, que não é funil nenhum;
  // mostrá-lo inteiro entregaria a ele o comercial da casa. Então: só nível total.
  if (!veTodoOAtendimento(viewer)) notFound();

  const attendances = await prisma.attendance.findMany({
    where: { status: { notIn: ["ARQUIVADO", "RASCUNHO", "RECUSADO"] }, officeId: viewer.officeId },
    include: { responsible: { select: { name: true } } },
    orderBy: [{ stageChangedAt: "desc" }, { createdAt: "desc" }],
  });

  const now = new Date();

  // ── QUEM ESTÁ ESPERANDO, E O EXPEDIENTE QUE GOVERNA O RELÓGIO ─────────────
  // Esta tela é só de quem vê o escritório inteiro (ver o gate acima), então a fila vem sem
  // recorte por dono — de propósito: quem organiza a captação precisa enxergar a fila toda, e é
  // isso que ele está autorizado a ver.
  const [fila, cfg] = await Promise.all([
    quemEstaEsperando(viewer.officeId, {}, viewer.id, now, 50),
    prisma.whatsappConfig.findUnique({
      where: { officeId: viewer.officeId },
      select: { expedienteInicio: true, expedienteFim: true },
    }),
  ]);
  const esperando = fila.lista.filter((q) => q.esperandoHa !== null);

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
        title="Triagem"
        subtitle="Primeiro o que tem relógio correndo. Depois o funil, que é do ritmo da semana."
        action={
          <Link
            href="/atendimento"
            className="inline-flex items-center gap-1.5 bg-sf text-tx-2 border border-regua hover:bg-sf-apoio text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <List size={16} /> Lista de Atendimentos
          </Link>
        }
      />

      <FilaDeEspera
        lista={esperando}
        expediente={cfg ? { inicio: cfg.expedienteInicio, fim: cfg.expedienteFim } : null}
      />

      {/* O FUNIL RECUA A RÓTULO DE SEÇÃO. Ele continua inteiro, com as mesmas cinco colunas e o
          mesmo arrastar — o que muda é o peso: um título de página anunciando o funil dizia que a
          tela era sobre o ritmo da semana, quando o que estoura nela é o relógio de quinze
          minutos. A taxa de conversão vem junto, na mesma linha, porque é leitura do funil. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-etiqueta font-bold uppercase tracking-wider text-tx-3">Funil comercial</h2>
        <span className="text-xs text-tx-3">
          arraste entre as colunas — o estágio continua sendo movido por você, nunca pelo sistema
        </span>
        {conversionRate !== null && (
          <span className="ml-auto text-xs text-tx-3">
            Taxa de conversão{" "}
            <span className="font-semibold tabular-nums text-concluido">{conversionRate.toFixed(0)}%</span> ({closed} de{" "}
            {closed + lost} decididos)
          </span>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 items-start">
        {STAGES.map((stage) => {
          const cards = byStage[stage];
          const total = totals.find((t) => t.stage === stage)!;
          return (
            <div key={stage} className="w-80 shrink-0 bg-sf-apoio border border-regua flex flex-col">
              <div className="px-4 py-3 border-b border-regua">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageDot[stage] }} />
                    <h3 className="font-semibold text-sm text-tx">{stageLabels[stage]}</h3>
                  </div>
                  <span className="text-xs font-semibold text-tx-2 bg-sf border border-regua rounded-full px-2 py-0.5">{total.count}</span>
                </div>
                {total.sum > 0 && (
                  <p className="text-xs text-tx-3 mt-1">{formatCurrency(total.sum)} estimado</p>
                )}
              </div>
              <div className="p-2.5 space-y-2">
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
