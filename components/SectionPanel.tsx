"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronsLeft } from "lucide-react";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, visibleSectionItems, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Painel de 190px que abre ao lado do rail (components/NavRail.tsx) — mostra os itens da seção
// ativa. Some por completo quando a seção é "painel" (ver AppShell.tsx: painelAberto é forçado
// a false nesse caso), quando o usuário recolhe pelo ChevronsLeft (preferência persistida em
// localStorage), ou no modo de visualização Bancada (onde components/SubTabsBar.tsx cumpre este
// papel horizontalmente). Ver proposta de remodelação do portal, "Arquitetura de navegação", e
// DESIGN-SYSTEM.md §3.
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
    <div className="w-[190px] shrink-0 hidden md:flex flex-col h-full bg-sf border-r border-regua">
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-regua">
        {/* Cabeçalho em 10px caixa alta, --tx-2 (DESIGN-SYSTEM.md §3) — era um título de 21px
            em font-serif; a seção já está identificada no rail ao lado, não precisa repetir
            em destaque aqui. */}
        <h2 className="text-[10px] font-semibold uppercase tracking-[.08em] text-tx-2">{def.label}</h2>
        <button
          type="button"
          onClick={onCollapse}
          data-tip="Recolher"
          className="p-1.5 rounded-lg text-tx-3 hover:bg-sf-apoio hover:text-tx transition-colors"
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
                  // Item ativo: fundo --sf-apoio, peso 700, sem filete (DESIGN-SYSTEM.md §3) —
                  // era um destaque bordô com fundo/texto translúcidos.
                  active
                    ? "bg-sf-apoio text-tx font-bold"
                    : "text-tx-2 font-medium hover:bg-sf-apoio hover:text-tx"
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
                            ? "bg-sf-apoio text-tx font-semibold"
                            : "text-tx-2 hover:bg-sf-apoio hover:text-tx"
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

      <div className="px-4 py-3 border-t border-regua text-[10px] text-tx-3">
        Duplo clique abre em aba fixa
      </div>
    </div>
  );
}
