"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, visibleSectionItems, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Sub-abas do modo de visualização Bancada (DESIGN-SYSTEM.md §3) — mostra os mesmos itens que
// components/SectionPanel.tsx lista verticalmente no modo Régua (visibleSectionItems da seção
// ativa), aqui como uma linha horizontal logo abaixo da barra de menus
// (components/TopMenuBar.tsx). Mesmo mecanismo de clique simples navega / duplo clique abre aba.
// Não mostra os `subItems` de 2º nível (Relatórios/Configurações, filtrados por `?secao=`): essas
// páginas já têm navegação própria em abas internas — ver nota do §3 sobre "abas internas de
// página" usarem a mesma regra de filete --acao.
export default function SubTabsBar({
  section,
  hasFinanceAccess = true,
  modules,
}: {
  section: SectionKey;
  hasFinanceAccess?: boolean;
  modules: OfficeModules;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
  if (items.length === 0) return null;

  return (
    <div className="h-9 shrink-0 flex items-stretch bg-sf border-b border-regua px-3 gap-4 overflow-x-auto scrollbar-thin">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => handleClick(e, item.href, item.label)}
            className={clsx(
              "shrink-0 flex items-center text-[13px] border-b-2 transition-colors",
              active ? "text-tx font-semibold border-acao" : "text-tx-2 font-medium border-transparent hover:text-tx"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
