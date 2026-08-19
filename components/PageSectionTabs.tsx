"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, visibleSectionItems, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Abas horizontais no topo do conteúdo, logo abaixo da TopBar — substituem o painel de seção de
// 190px (components/SectionPanel.tsx, removido no redesenho Modernist) para navegar entre os
// itens da MESMA seção ativa (ex.: Financeiro > Despesas/Receitas/Fluxo de caixa/DRE/Livro
// caixa, ver lib/navSections.ts). Os `subItems` de cada item (Relatórios/Configurações, filtro
// `?secao=`) NÃO entram aqui — cada uma dessas duas páginas já tem seu próprio sub-nav interno
// (chips por `secao`), o painel antigo só duplicava esse acesso. "painel" e seções com um único
// item não mostram nada — não há entre o quê navegar. Ver documento 02 do handoff do redesenho.
export default function PageSectionTabs({
  section,
  hasFinanceAccess,
  modules,
}: {
  section: SectionKey | "painel" | null;
  hasFinanceAccess: boolean;
  modules: OfficeModules;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { openTab, goToLiveView } = useTabs();

  // Mesmo mecanismo de duplo clique do rail (components/NavRail.tsx) e do antigo SectionPanel:
  // clique simples navega, um 2º clique dentro da janela abre em aba nova.
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

  if (!section || section === "painel") return null;
  const def = RAIL_SECTIONS.find((s) => s.key === section);
  if (!def) return null;
  const items = visibleSectionItems(def, { hasFinanceAccess, modules });
  if (items.length < 2) return null;

  return (
    <div className="h-10 shrink-0 flex items-center gap-4 px-4 md:px-6 border-b-2 border-regua-forte bg-sf overflow-x-auto scrollbar-thin">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => handleClick(e, item.href, item.label)}
            className={clsx(
              "shrink-0 h-full flex items-center text-sm border-b-2 -mb-0.5 transition-colors",
              active ? "font-extrabold text-tx border-acao" : "font-normal text-tx-2 border-transparent hover:text-tx"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
