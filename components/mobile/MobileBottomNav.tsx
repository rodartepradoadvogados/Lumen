"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Bell, Briefcase, Menu } from "lucide-react";

const items = [
  { href: "/m", label: "Início", Icon: Home, exact: true, badge: false },
  { href: "/m/agenda", label: "Agenda", Icon: Calendar, exact: false, badge: false },
  { href: "/m/publicacoes", label: "Publicações", Icon: Bell, exact: false, badge: true },
  { href: "/m/processos", label: "Processos", Icon: Briefcase, exact: false, badge: false },
  { href: "/m/mais", label: "Mais", Icon: Menu, exact: false, badge: false },
];

export default function MobileBottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 h-16 bg-white dark:bg-navy-900 border-t border-navy-800/10 dark:border-white/10 flex z-40 shadow-[0_-2px_12px_rgba(15,31,61,0.06)]">
      {items.map(({ href, label, Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
          >
            <span className="relative">
              <Icon size={22} className={active ? "text-gold-600 dark:text-gold-400" : "text-navy-800/40 dark:text-cream-50/40"} />
              {badge && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-bordo-600 dark:bg-bordo-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
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
