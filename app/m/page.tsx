import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getTodayItems, type TodayItem } from "@/lib/alerts";
import { Card, EmptyState } from "@/components/ui";
import {
  CalendarClock,
  CalendarPlus,
  Gavel,
  Stethoscope,
  ListTodo,
  Bell,
  ChevronRight,
  Clock,
} from "lucide-react";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const kindIcon: Record<TodayItem["kind"], typeof ListTodo> = {
  TAREFA: ListTodo,
  EVENTO: CalendarPlus,
  AUDIENCIA: Gavel,
  PERICIA: Stethoscope,
  PRAZO: CalendarClock,
  CONTA_PAGAR: ListTodo,
  CONTA_RECEBER: ListTodo,
};

export default async function MobileHome() {
  const [user, items, unreadCount] = await Promise.all([
    getCurrentUser(),
    getTodayItems(false),
    prisma.publication.count({ where: { read: false } }),
  ]);

  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-navy-800/50">Resumo do seu dia</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/m/agenda">
          <Card className="p-4 h-full">
            <div className="flex items-center gap-2 text-gold-700 mb-1">
              <CalendarClock size={18} />
              <span className="text-xs font-semibold text-navy-800/55 uppercase tracking-wide">Hoje</span>
            </div>
            <p className="text-2xl font-serif font-bold text-navy-900">{items.length}</p>
            <p className="text-xs text-navy-800/50 mt-0.5">tarefa(s) do dia</p>
          </Card>
        </Link>
        <Link href="/m/publicacoes">
          <Card className="p-4 h-full">
            <div className="flex items-center gap-2 text-gold-700 mb-1">
              <Bell size={18} />
              <span className="text-xs font-semibold text-navy-800/55 uppercase tracking-wide">Publicações</span>
            </div>
            <p className="text-2xl font-serif font-bold text-navy-900">{unreadCount}</p>
            <p className="text-xs text-navy-800/50 mt-0.5">não lida(s)</p>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800/8">
          <h2 className="font-serif font-bold text-navy-900 text-sm">Agenda de hoje</h2>
          <Link href="/m/agenda" className="text-[11px] font-semibold text-gold-700 flex items-center gap-0.5">
            Ver tudo <ChevronRight size={13} />
          </Link>
        </div>
        {items.length === 0 ? (
          <EmptyState title="Nada para hoje" subtitle="Aproveite o dia" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {items.map((it) => {
              const Icon = kindIcon[it.kind] ?? ListTodo;
              return (
                <Link key={it.id} href="/m/agenda" className="flex items-center gap-3 px-4 py-3">
                  <span className="h-9 w-9 rounded-lg bg-navy-900/5 text-navy-800 flex items-center justify-center shrink-0">
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-900 truncate">{it.title}</p>
                    {it.subtitle && <p className="text-xs text-navy-800/45 truncate">{it.subtitle}</p>}
                  </div>
                  {it.time && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-navy-800/55 shrink-0">
                      <Clock size={12} /> {it.time}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
