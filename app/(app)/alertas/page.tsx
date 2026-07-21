import Link from "next/link";
import { getAlerts, getTodayItems } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader, EmptyState } from "@/components/ui";
import DeletionRequestsPanel from "@/components/DeletionRequestsPanel";
import AlertRow from "@/components/AlertRow";
import { AlertTriangle, Wallet, AtSign, CalendarClock, CalendarCheck2, Gavel, Stethoscope, ListTodo, PhoneCall, UserPlus, LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const kindMeta: Record<string, { label: string; icon: LucideIcon }> = {
  PRAZO_VENCIDO: { label: "Prazo Vencido", icon: AlertTriangle },
  CONTA_PAGAR_VENCIDA: { label: "Conta a Pagar Vencida", icon: Wallet },
  CONTA_RECEBER_VENCIDA: { label: "Conta a Receber Vencida", icon: Wallet },
  MENCAO: { label: "Menção", icon: AtSign },
  PARCELA_SEM_VENCIMENTO: { label: "Parcela Sem Vencimento", icon: CalendarClock },
  FOLLOWUP_ATRASADO: { label: "Follow-up Atrasado", icon: PhoneCall },
  TAREFA_DELEGADA: { label: "Tarefa Delegada", icon: UserPlus },
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

const severityStyle: Record<string, string> = {
  alta: "border-l-4 border-red-500 dark:border-bordo-400",
  media: "border-l-4 border-gold-500",
  baixa: "border-l-4 border-slate-300 dark:border-white/20",
};

export default async function AlertasPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = searchParams.tab === "hoje" ? "hoje" : "pendentes";
  const viewer = await getCurrentUser();
  const isAdmin = viewer?.isAdmin ?? false;
  const hasFinanceAccess = Boolean(viewer?.isAdmin || viewer?.financeAccess);
  const [alerts, todayItems] = await Promise.all([getAlerts(hasFinanceAccess, viewer?.id), getTodayItems(hasFinanceAccess)]);

  const pendingDeletions = isAdmin
    ? await prisma.deletionRequest.findMany({
        where: { status: "PENDENTE" },
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
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${tab === "pendentes" ? "bg-navy-900 text-white" : "bg-white dark:bg-navy-800 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"}`}
        >
          Pendentes
        </Link>
        <Link
          href="/alertas?tab=hoje"
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${tab === "hoje" ? "bg-navy-900 text-white" : "bg-white dark:bg-navy-800 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"}`}
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
              <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                {alerts.map((a) => {
                  const meta = kindMeta[a.kind];
                  const Icon = meta.icon;
                  return (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      className={`flex items-start gap-3 px-5 py-3.5 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors w-full text-left ${severityStyle[a.severity]}`}
                    >
                      <div className="p-2 rounded-lg bg-navy-900/5 dark:bg-white/10 text-navy-800 dark:text-cream-50 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">{meta.label}</p>
                        <p className="text-sm font-medium text-navy-900 dark:text-cream-50 mt-0.5">{a.title}</p>
                        {a.subtitle && <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">{a.subtitle}</p>}
                      </div>
                      <span className="text-xs text-navy-800/40 dark:text-cream-50/40 shrink-0">{a.date.toLocaleDateString("pt-BR")}</span>
                    </AlertRow>
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
            <div className="divide-y divide-navy-800/5 dark:divide-white/10">
              {todayItems.map((item) => {
                const meta = todayMeta[item.kind];
                const Icon = meta.icon;
                return (
                  <Link key={item.id} href={item.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors">
                    <div className="p-2 rounded-lg bg-navy-900/5 dark:bg-white/10 text-navy-800 dark:text-cream-50 shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">{meta.label}</p>
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50 mt-0.5">{item.title}</p>
                      {item.subtitle && <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">{item.subtitle}</p>}
                    </div>
                    {item.time && <span className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 shrink-0">{item.time}</span>}
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
