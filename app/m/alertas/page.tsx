import Link from "next/link";
import { redirect } from "next/navigation";
import { getAlerts, getTodayItems } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, EmptyState, dueStatusClassName, dueStatusPulseClassName } from "@/components/ui";
import AlertRow from "@/components/AlertRow";
import DismissibleAlertRow from "@/components/DismissibleAlertRow";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import { metaDoAlerta } from "@/lib/alertKinds";
import { AlertTriangle, Wallet, CalendarCheck2, Gavel, Stethoscope, ListTodo, LucideIcon } from "lucide-react";
import { recorteDosAlertasDeAtendimento } from "@/lib/acessoAtendimento";
import { podeAcessarAba } from "@/lib/peticionamentoAcesso";

export const dynamic = "force-dynamic";

// Equivalente mobile de app/(app)/alertas/page.tsx — mesma fonte de dados (getAlerts/
// getTodayItems, lib/alerts.ts) e mesma lógica de clique (AlertRow), só com o shell/estilo do
// app mobile (largura cheia, cards empilhados, cabeçalhos como em app/m/publicacoes/page.tsx).
// Antes desta página existir, menções/prazos vencidos/tarefas delegadas não apareciam em
// lugar nenhum do app mobile — só a Central de Alertas do site (desktop) mostrava tudo isso.

const todayMeta: Record<string, { label: string; icon: LucideIcon }> = {
  TAREFA: { label: "Tarefa", icon: ListTodo },
  EVENTO: { label: "Evento", icon: CalendarCheck2 },
  AUDIENCIA: { label: "Audiência", icon: Gavel },
  PERICIA: { label: "Perícia", icon: Stethoscope },
  PRAZO: { label: "Prazo", icon: AlertTriangle },
  CONTA_PAGAR: { label: "Conta a Pagar", icon: Wallet },
  CONTA_RECEBER: { label: "Conta a Receber", icon: Wallet },
};

// Filete esquerdo de 3px por severidade (DESIGN-SYSTEM.md §8) — o rótulo do tipo de alerta já
// diferencia as 12 chaves de `kindMeta`; nenhuma delas ganha cor própria, só a severidade.
const severityStyle: Record<string, string> = {
  alta: "border-l-[3px] border-urgente",
  media: "border-l-[3px] border-marca-tx",
  baixa: "border-l-[3px] border-tx-3",
};

export default async function MobileAlertas({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = searchParams.tab === "hoje" ? "hoje" : "pendentes";
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);
  const [alerts, todayItems] = await Promise.all([
    getAlerts(viewer.officeId, hasFinanceAccess, viewer.id, viewer.isAdmin, recorteDosAlertasDeAtendimento(viewer, viewer.id), podeAcessarAba(viewer)),
    getTodayItems(viewer.officeId, hasFinanceAccess),
  ]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-tx">Central de Alertas</h1>
        <p className="text-sm text-tx-2">
          {tab === "pendentes" ? `${alerts.length} pendente(s)` : `${todayItems.length} item(ns) para hoje`}
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/m/alertas?tab=pendentes"
          className={`text-sm font-semibold px-4 py-2 transition-colors ${tab === "pendentes" ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 border border-regua"}`}
        >
          Pendentes
        </Link>
        <Link
          href="/m/alertas?tab=hoje"
          className={`text-sm font-semibold px-4 py-2 transition-colors ${tab === "hoje" ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 border border-regua"}`}
        >
          Hoje
        </Link>
      </div>

      {tab === "pendentes" && (
        <Card>
          {alerts.length === 0 ? (
            <EmptyState title="Tudo em dia!" subtitle="Nenhum alerta pendente no momento" />
          ) : (
            <div className="divide-y divide-regua">
              {alerts.map((a) => {
                const { icon: Icon, label: metaLabel } = metaDoAlerta(a.kind);
                return (
                  <DismissibleAlertRow
                    key={a.id}
                    kind={a.kind}
                    entityId={a.entityId}
                    rowClassName={`${severityStyle[a.severity]} ${dueStatusClassName(a.dueStatus)} ${dueStatusPulseClassName(a.dueStatus)}`}
                  >
                    <AlertRow alert={a} className="flex items-start gap-3 px-4 py-3 w-full text-left">
                      <div className="p-2 bg-sf-apoio text-tx-2 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-corpo font-semibold text-tx-2 uppercase tracking-wide">{metaLabel}</p>
                        <p className="text-sm font-medium text-tx mt-0.5 break-words">{a.title}</p>
                        {a.subtitle && <p className="text-corpo text-tx-2 mt-0.5 break-words">{a.subtitle}</p>}
                        {a.processNumber && <ProcessNumberChip processNumber={a.processNumber} />}
                        <span className="text-corpo text-tx-2 mt-1 block">{a.date.toLocaleDateString("pt-BR")}</span>
                      </div>
                    </AlertRow>
                  </DismissibleAlertRow>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "hoje" && (
        <Card>
          {todayItems.length === 0 ? (
            <EmptyState title="Nada para hoje" subtitle="Nenhum compromisso ou vencimento hoje" />
          ) : (
            <div className="divide-y divide-regua">
              {todayItems.map((item) => {
                // Guardado pelo mesmo motivo de metaDoAlerta: um tipo novo no banco não pode derrubar a tela.
                const meta = todayMeta[item.kind] ?? { label: item.kind, icon: CalendarCheck2 };
                const Icon = meta.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-start gap-3 px-4 py-3 ${dueStatusClassName(item.dueStatus)} ${dueStatusPulseClassName(item.dueStatus)}`}
                  >
                    <div className="p-2 bg-sf-apoio text-tx-2 shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-corpo font-semibold text-tx-2 uppercase tracking-wide">{meta.label}</p>
                      <p className="text-sm font-medium text-tx mt-0.5 break-words">{item.title}</p>
                      {item.subtitle && <p className="text-corpo text-tx-2 mt-0.5 break-words">{item.subtitle}</p>}
                    </div>
                    {item.time && <span className="text-corpo font-semibold text-tx-2 shrink-0">{item.time}</span>}
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
