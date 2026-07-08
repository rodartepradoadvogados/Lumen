"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  Briefcase,
  Wallet,
  Users,
  Newspaper,
  Bell,
  Settings,
  Headset,
} from "lucide-react";
import clsx from "clsx";

const nav = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/kanban", label: "Kanban", icon: Kanban },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/processos", label: "Processos e Casos", icon: Briefcase },
  { href: "/atendimento", label: "Atendimento", icon: Headset },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/publicacoes", label: "Publicações", icon: Newspaper },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-navy-900 text-cream-100 flex flex-col h-full">
      <div className="px-6 py-6 border-b border-white/10">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="h-px flex-1 bg-gold-500/60" />
          <span className="h-1 w-1 rounded-full bg-gold-500" />
          <span className="h-px flex-1 bg-gold-500/60" />
        </div>
        <h1 className="font-serif text-xl font-bold tracking-wide text-center leading-tight">
          RODARTE PRADO
        </h1>
        <p className="text-center text-[11px] tracking-[0.3em] text-gold-500 font-medium mt-0.5">
          ADVOGADOS
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-gold-600/90 text-navy-950 shadow-card"
                  : "text-cream-100/80 hover:bg-white/5 hover:text-cream-50"
              )}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 text-[11px] text-cream-100/50">
        Sistema Interno · v0.1
      </div>
    </aside>
  );
}
