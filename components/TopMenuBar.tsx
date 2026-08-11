"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import LumenMark from "@/components/LumenMark";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, isSectionVisible, sectionForPathname, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Barra de menus do modo de visualização Bancada (DESIGN-SYSTEM.md §3) — as mesmas 6 seções do
// rail (components/NavRail.tsx), aqui como itens de menu horizontal em vez de ícones verticais.
// Clique simples navega; duplo clique abre em aba nova — mesmo mecanismo de NavRail/SectionPanel,
// reaproveitado ao pé da letra (ver comentário lá para o motivo do timer).
//
// A marca (LumenMark) à esquerda NÃO está na lista original de "as 6 seções como menus" da
// tarefa — foi uma decisão própria: sem ela não haveria nenhum jeito de voltar ao Painel a
// partir da Bancada (hoje só o rail, ausente neste modo, carrega esse link). Ver relato final.
export default function TopMenuBar({
  hasFinanceAccess = true,
  modules,
  activeSection,
  onSelectSection,
}: {
  hasFinanceAccess?: boolean;
  modules: OfficeModules;
  activeSection: SectionKey | "painel" | null;
  onSelectSection: (section: SectionKey | "painel") => void;
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

  function handleClick(e: React.MouseEvent, href: string, label: string, section: SectionKey | "painel") {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    onSelectSection(section);

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

  const visibleSections = RAIL_SECTIONS.filter((s) => isSectionVisible(s, { hasFinanceAccess, modules }));
  const currentSection = activeSection ?? sectionForPathname(pathname);

  return (
    <div className="h-9 shrink-0 flex items-stretch bg-grafite-800 px-1 gap-0.5 overflow-x-auto scrollbar-thin">
      <Link
        href="/painel"
        onClick={(e) => handleClick(e, "/painel", "Painel", "painel")}
        data-tip="Painel"
        data-tip-pos="bottom"
        className="shrink-0 flex items-center px-2"
      >
        <LumenMark size={18} />
      </Link>
      {visibleSections.map((section) => {
        const active = currentSection === section.key;
        return (
          <Link
            key={section.key}
            href={section.items[0].href}
            onClick={(e) => handleClick(e, section.items[0].href, section.label, section.key)}
            className={clsx(
              "shrink-0 flex items-center px-3 text-[13px] border-b-2 transition-colors",
              active
                ? "text-white font-semibold border-marca"
                : "text-menu-tx font-medium border-transparent hover:text-white"
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
