"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Bell, Newspaper, Menu } from "lucide-react";

// Barra reduzida a 4 abas fixas (Agenda, Alertas, Publicações, Menu) — Início deixou de ser
// uma aba própria (o logo/nome do escritório no cabeçalho leva pra lá, ver app/m/layout.tsx)
// e Processos saiu daqui (fica a 1 toque na grade da Início e ganhou atalho em Menu, ver
// app/m/mais/page.tsx) pra abrir espaço sem disputar com o que se usa todo dia. Alertas e
// Publicações usam o MESMO ícone da grade da Início — reforça que é o mesmo destino, não um
// atalho novo pra aprender.
const items = [
  { href: "/m/agenda", label: "Agenda", Icon: Calendar, exact: false, badge: "agenda" as const },
  { href: "/m/alertas", label: "Alertas", Icon: Bell, exact: false, badge: "alerts" as const },
  { href: "/m/publicacoes", label: "Publicações", Icon: Newspaper, exact: false, badge: null },
  { href: "/m/mais", label: "Menu", Icon: Menu, exact: false, badge: null },
];

export default function MobileBottomNav({ alertsCount, todayAgendaCount = 0 }: { alertsCount: number; todayAgendaCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 h-16 bg-white dark:bg-navy-900 border-t border-navy-800/10 dark:border-white/10 flex z-40 shadow-[0_-2px_12px_rgba(15,31,61,0.06)]">
      {items.map(({ href, label, Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        // "agenda" conta compromissos de HOJE (ver getTodayAgendaCount) — conceito diferente de
        // "alerts" (menções, prazos vencidos, tarefas delegadas etc.), por isso cada aba lê a
        // sua própria prop em vez de dividir alertsCount entre as duas.
        const badgeCount = badge === "agenda" ? todayAgendaCount : badge === "alerts" ? alertsCount : 0;
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
          >
            <span className="relative">
              <span
                className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                  active ? "bg-bordo-700 dark:bg-bordo-500" : ""
                }`}
              >
                <Icon
                  size={19}
                  className={active ? "text-white dark:text-navy-950" : "text-navy-800/40 dark:text-cream-50/40"}
                />
              </span>
              {badge && badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-bordo-600 dark:bg-bordo-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span
              className={`text-[10px] font-medium leading-none ${
                active ? "text-navy-900 dark:text-cream-50" : "text-navy-800/40 dark:text-cream-50/40"
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
