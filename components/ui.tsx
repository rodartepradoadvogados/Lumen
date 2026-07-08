import clsx from "clsx";
import { ReactNode } from "react";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-white rounded-xl border border-navy-800/8 shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
      <div>
        <h3 className="font-serif font-bold text-navy-900 text-base">{title}</h3>
        {subtitle && <p className="text-xs text-navy-800/50 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  navy: "bg-navy-900/10 text-navy-900",
  gold: "bg-gold-500/15 text-gold-800",
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({ children, color = "slate", className }: { children: ReactNode; color?: keyof typeof badgeColors; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap", badgeColors[color], className)}>
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "navy",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "navy" | "gold" | "red" | "green";
  icon?: ReactNode;
}) {
  const toneMap = {
    navy: "text-navy-900",
    gold: "text-gold-700",
    red: "text-red-600",
    green: "text-emerald-600",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-navy-800/55 uppercase tracking-wide">{label}</p>
          <p className={clsx("text-2xl font-serif font-bold mt-1", toneMap[tone])}>{value}</p>
          {hint && <p className="text-xs text-navy-800/45 mt-1">{hint}</p>}
        </div>
        {icon && <div className={clsx("p-2 rounded-lg bg-cream-100", toneMap[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center py-12 text-navy-800/40">
      <p className="font-medium">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="text-sm text-navy-800/55 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(d: Date | string) {
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR");
}

export const taskTypeLabels: Record<string, string> = {
  TAREFA: "Tarefa",
  EVENTO: "Evento",
  AUDIENCIA: "Audiência",
  PERICIA: "Perícia",
  PRAZO: "Prazo",
};

export const taskTypeColors: Record<string, keyof typeof badgeColors> = {
  TAREFA: "slate",
  EVENTO: "blue",
  AUDIENCIA: "gold",
  PERICIA: "amber",
  PRAZO: "red",
};

export const priorityColors: Record<string, keyof typeof badgeColors> = {
  BAIXA: "slate",
  MEDIA: "blue",
  ALTA: "amber",
  URGENTE: "red",
};
