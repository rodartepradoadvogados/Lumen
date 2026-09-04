import Link from "next/link";
import { redirect } from "next/navigation";
import { getAlerts, getTodayItems } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader, EmptyState, dueStatusClassName, dueStatusPulseClassName } from "@/components/ui";
import DeletionRequestsPanel from "@/components/DeletionRequestsPanel";
import AlertRow from "@/components/AlertRow";
import DismissibleAlertRow from "@/components/DismissibleAlertRow";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import { AlertTriangle, Wallet, AtSign, CalendarClock, CalendarCheck2, Gavel, Stethoscope, ListTodo, PhoneCall, UserPlus, FolderSync, ClipboardList, AlarmClock, LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const kindMeta: Record<string, { label: string; icon: LucideIcon }> = {
  PRAZO_VENCIDO: { label: "Prazo Vencido", icon: AlertTriangle },
  CONTA_PAGAR_VENCIDA: { label: "Conta a Pagar Vencida", icon: Wallet },
  CONTA_RECEBER_VENCIDA: { label: "Conta a Receber Vencida", icon: Wallet },
  MENCAO: { label: "Menção", icon: AtSign },
  PARCELA_SEM_VENCIMENTO: { label: "Parcela Sem Vencimento", icon: CalendarClock },
  FOLLOWUP_ATRASADO: { label: "Follow-up Atrasado", icon: PhoneCall },
  TAREFA_DELEGADA: { label: "Tarefa Delegada", icon: UserPlus },
  DRIVE_INCONSISTENCIA: { label: "Inconsistência no Drive", icon: FolderSync },
  HONORARIO_APURAR_DECISAO: { label: "Honorário a Apurar — Decisão", icon: Gavel },
  HONORARIO_APURAR_PARADO: { label: "Honorário a Apurar — Parado", icon: Gavel },
  PENDENCIA_ATENDIMENTO_VENCIDA: { label: "Pendência do Atendimento", icon: ClipboardList },
  RESPOSTA_PRAZO_ESTOURADO: { label: "Prazo de Resposta Estourado", icon: AlarmClock },
};

const todayMeta: Record<string, { label: string; icon: LucideIcon }> = {
  TAREFA: { label: "Tarefa", icon: ListTodo },
  EVENTO: { label: "Evento", icon: CalendarCheck2 },
  AUDIENCIA: { label: "Audiência", icon: Gavel },
  PERICIA: { label: "Perícia", icon: Stethoscope },
  PRAZO: { label: "Prazo", icon: AlertTriangle },
  CONTA_PAGAR: { label: "Conta a Pagar", icon: Wallet },
  CONTA_RECEBER: { label: "Conta a Receber", icon: Wallet },
};

// Severidade da Central de Alertas: filete esquerdo de 3px, altura total da linha. Nenhum dos
// doze tipos de alerta (kindMeta acima) ganha cor própria — só a severidade fala aqui.
// Ver DESIGN-SYSTEM.md §8.
const severityStyle: Record<string, string> = {
  alta: "border-l-[3px] border-urgente",
  media: "border-l-[3px] border-marca",
  baixa: "border-l-[3px] border-tx-3",
};

// Rótulo do tipo de alerta acima do título: 9,5px caixa alta, tracking .1em, --tx-2.
const kindLabelClass = "text-[9.5px] font-semibold text-tx-2 uppercase tracking-[.1em]";

export default async function AlertasPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = searchParams.tab === "hoje" ? "hoje" : "pendentes";
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const isAdmin = viewer.isAdmin;
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);
  const [alerts, todayItems] = await Promise.all([
    getAlerts(viewer.officeId, hasFinanceAccess, viewer.id, viewer.isAdmin),
    getTodayItems(viewer.officeId, hasFinanceAccess),
  ]);

  const pendingDeletions = isAdmin
    ? await prisma.deletionRequest.findMany({
        where: { status: "PENDENTE", officeId: viewer.officeId },
        include: { requestedBy: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in space-y-4">
      <PageHeader title="Central de Alertas" subtitle={tab === "pendentes" ? `${alerts.length} pendente(s)` : `${todayItems.length} item(ns) para hoje`} />

      <div className="flex gap-2">
        <Link
          href="/alertas?tab=pendentes"
          className={`text-sm font-semibold px-4 py-2 transition-colors ${tab === "pendentes" ? "bg-acao text-acao-tx" : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"}`}
        >
          Pendentes
        </Link>
        <Link
          href="/alertas?tab=hoje"
          className={`text-sm font-semibold px-4 py-2 transition-colors ${tab === "hoje" ? "bg-acao text-acao-tx" : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"}`}
        >
          Hoje
        </Link>
      </div>

      {tab === "pendentes" && (
        <div className="space-y-6">
          {isAdmin && pendingDeletions.length > 0 && (
            <Card>
              <CardHeader title="Solicitações de Exclusão Pendentes" subtitle={`${pendingDeletions.length} aguardando aprovação`} />
              <DeletionRequestsPanel
                requests={pendingDeletions.map((r) => ({
                  id: r.id,
                  entityType: r.entityType,
                  entityLabel: r.entityLabel,
                  scope: r.scope,
                  alsoDeleteLinked: r.alsoDeleteLinked,
                  createdAt: r.createdAt.toISOString(),
                  requestedBy: { name: r.requestedBy.name },
                }))}
              />
            </Card>
          )}

          <Card>
            {alerts.length === 0 ? (
              <EmptyState title="Tudo em dia!" subtitle="Nenhum alerta pendente no momento" />
            ) : (
              <div className="divide-y divide-regua stagger-in">
                {alerts.map((a) => {
                  const meta = kindMeta[a.kind];
                  const Icon = meta.icon;
                  return (
                    <DismissibleAlertRow
                      key={a.id}
                      kind={a.kind}
                      entityId={a.entityId}
                      rowClassName={`${severityStyle[a.severity]} ${dueStatusClassName(a.dueStatus)} ${dueStatusPulseClassName(a.dueStatus)}`}
                    >
                      <AlertRow alert={a} className="flex items-start gap-3 px-5 py-3.5 hover:bg-sf-apoio transition-colors w-full text-left">
                        <div className="p-2 bg-sf-apoio text-tx shrink-0">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={kindLabelClass}>{meta.label}</p>
                          <p className="text-sm font-medium text-tx mt-0.5 break-words">{a.title}</p>
                          {a.subtitle && <p className="text-xs text-tx-3 mt-0.5 break-words">{a.subtitle}</p>}
                          {a.processNumber && <ProcessNumberChip processNumber={a.processNumber} />}
                        </div>
                        <span className="text-xs text-tx-3 shrink-0">{a.date.toLocaleDateString("pt-BR")}</span>
                      </AlertRow>
                    </DismissibleAlertRow>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "hoje" && (
        <Card>
          {todayItems.length === 0 ? (
            <EmptyState title="Nada para hoje" subtitle="Nenhum compromisso ou vencimento hoje" />
          ) : (
            <div className="divide-y divide-regua stagger-in">
              {todayItems.map((item) => {
                const meta = todayMeta[item.kind];
                const Icon = meta.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-start gap-3 px-5 py-3.5 hover:bg-sf-apoio transition-colors ${dueStatusClassName(item.dueStatus)} ${dueStatusPulseClassName(item.dueStatus)}`}
                  >
                    <div className="p-2 bg-sf-apoio text-tx shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={kindLabelClass}>{meta.label}</p>
                      <p className="text-sm font-medium text-tx mt-0.5 break-words">{item.title}</p>
                      {item.subtitle && <p className="text-xs text-tx-3 mt-0.5 break-words">{item.subtitle}</p>}
                    </div>
                    {item.time && <span className="text-xs font-semibold text-tx-3 shrink-0">{item.time}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
