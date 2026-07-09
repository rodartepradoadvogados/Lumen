import Link from "next/link";
import { getAlerts } from "@/lib/alerts";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { AlertTriangle, Clock, Newspaper, Wallet, AtSign, CalendarClock, LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const kindMeta: Record<string, { label: string; icon: LucideIcon }> = {
  PRAZO_VENCIDO: { label: "Prazo Vencido", icon: AlertTriangle },
  PRAZO_PROXIMO: { label: "Prazo Próximo", icon: Clock },
  PUBLICACAO_NAO_LIDA: { label: "Publicação Não Lida", icon: Newspaper },
  CONTA_PAGAR_VENCIDA: { label: "Conta a Pagar Vencida", icon: Wallet },
  CONTA_RECEBER_VENCIDA: { label: "Conta a Receber Vencida", icon: Wallet },
  MENCAO: { label: "Menção", icon: AtSign },
  PARCELA_SEM_VENCIMENTO: { label: "Parcela Sem Vencimento", icon: CalendarClock },
};

const severityStyle: Record<string, string> = {
  alta: "border-l-4 border-red-500",
  media: "border-l-4 border-gold-500",
  baixa: "border-l-4 border-slate-300",
};

export default async function AlertasPage() {
  const alerts = await getAlerts();

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in">
      <PageHeader title="Central de Alertas" subtitle={`${alerts.length} alerta(s) ativo(s)`} />

      <Card>
        {alerts.length === 0 ? (
          <EmptyState title="Tudo em dia!" subtitle="Nenhum alerta pendente no momento" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {alerts.map((a) => {
              const meta = kindMeta[a.kind];
              const Icon = meta.icon;
              return (
                <Link key={a.id} href={a.href} className={`flex items-start gap-3 px-5 py-3.5 hover:bg-cream-50 transition-colors ${severityStyle[a.severity]}`}>
                  <div className="p-2 rounded-lg bg-navy-900/5 text-navy-800 shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-navy-800/40 uppercase tracking-wide">{meta.label}</p>
                    <p className="text-sm font-medium text-navy-900 mt-0.5">{a.title}</p>
                    {a.subtitle && <p className="text-xs text-navy-800/50 mt-0.5">{a.subtitle}</p>}
                  </div>
                  <span className="text-xs text-navy-800/40 shrink-0">{a.date.toLocaleDateString("pt-BR")}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
