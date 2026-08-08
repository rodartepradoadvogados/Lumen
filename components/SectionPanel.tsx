"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronsLeft } from "lucide-react";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, visibleSectionItems, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Painel de 224px que abre ao lado do rail (components/NavRail.tsx) — mostra os itens da seção
// ativa. Some por completo quando a seção é "painel" (ver AppShell.tsx: painelAberto é forçado
// a false nesse caso) ou quando o usuário recolhe pelo ChevronsLeft (preferência persistida em
// localStorage). Ver proposta de remodelação do portal, "Arquitetura de navegação".
export default function SectionPanel({
  section,
  hasFinanceAccess = true,
  isAdmin = false,
  canConfigureIntegrations = false,
  modules,
  onCollapse,
}: {
  section: SectionKey;
  hasFinanceAccess?: boolean;
  isAdmin?: boolean;
  canConfigureIntegrations?: boolean;
  modules: OfficeModules;
  onCollapse: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { openTab, goToLiveView } = useTabs();

  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = clickTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  function handleClick(e: React.MouseEvent, href: string, label: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    const pending = clickTimers.current[href];
    if (pending) {
      clearTimeout(pending);
      delete clickTimers.current[href];
      openTab(href, label);
      return;
    }
    clickTimers.current[href] = setTimeout(() => {
      delete clickTimers.current[href];
      goToLiveView();
      router.push(href);
    }, 250);
  }

  const def = RAIL_SECTIONS.find((s) => s.key === section);
  if (!def) return null;
  const items = visibleSectionItems(def, { hasFinanceAccess, modules });

  return (
    <div className="w-[224px] shrink-0 hidden md:flex flex-col h-full bg-white dark:bg-navy-950 border-r border-navy-800/8 dark:border-white/10">
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-navy-800/8 dark:border-white/10">
        <h2 className="font-serif font-bold text-[21px] text-navy-900 dark:text-cream-50">{def.label}</h2>
        <button
          type="button"
          onClick={onCollapse}
          data-tip="Recolher"
          className="p-1.5 rounded-lg text-navy-800/40 dark:text-cream-50/40 hover:bg-navy-900/5 dark:hover:bg-white/10 hover:text-navy-900 dark:hover:text-cream-50 transition-colors"
        >
          <ChevronsLeft size={16} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2.5 py-3 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const visibleSub =
            item.subItems?.filter(
              (sub) =>
                (!sub.adminOnly || isAdmin) &&
                (!sub.financeOnly || hasFinanceAccess) &&
                (!sub.configOnly || isAdmin || canConfigureIntegrations)
            ) ?? [];
          const currentSubValue = item.subParam ? searchParams.get(item.subParam) ?? item.subDefaultValue : undefined;

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={(e) => handleClick(e, item.href, item.label)}
                className={clsx(
                  "block px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-[rgba(110,13,37,0.08)] text-[#6e0d25] dark:bg-[rgba(201,106,128,0.14)] dark:text-[#c96a80] font-semibold"
                    : "text-navy-800/70 dark:text-cream-50/70 font-medium hover:bg-navy-900/5 dark:hover:bg-white/5 hover:text-navy-900 dark:hover:text-cream-50"
                )}
              >
                {item.label}
              </Link>

              {active && visibleSub.length > 0 && (
                <div className="pl-3 pt-0.5 pb-1 space-y-0.5">
                  {visibleSub.map((sub) => {
                    const subHref = `${item.href}${sub.value ? `?${item.subParam}=${sub.value}` : ""}`;
                    const subActive = currentSubValue === (sub.value ?? undefined);
                    return (
                      <Link
                        key={sub.label}
                        href={subHref}
                        onClick={(e) => handleClick(e, subHref, sub.label)}
                        className={clsx(
                          "block px-3 py-1.5 rounded-md text-[13px] transition-colors",
                          subActive
                            ? "bg-[rgba(110,13,37,0.08)] text-[#6e0d25] dark:bg-[rgba(201,106,128,0.14)] dark:text-[#c96a80] font-semibold"
                            : "text-navy-800/60 dark:text-cream-50/60 hover:bg-navy-900/5 dark:hover:bg-white/5 hover:text-navy-900 dark:hover:text-cream-50"
                        )}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-navy-800/8 dark:border-white/10 text-[10px] text-navy-800/40 dark:text-cream-50/40">
        Duplo clique abre em aba fixa
      </div>
    </div>
  );
}
