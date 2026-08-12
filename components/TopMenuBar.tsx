"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import LumenMark from "@/components/LumenMark";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, isSectionVisible, sectionForPathname, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Barra de menus do modo de visualização Bancada (DESIGN-SYSTEM.md §3). As 6 seções do rail
// (components/NavRail.tsx) não ficam mais expostas como cards horizontais fixos — moraram para
// dentro de um menu suspenso, disparado pelo próprio ícone da marca (pedido do dono do
// escritório: "menu representado pelo próprio ícone da logomarca", pra a faixa ocupar menos
// espaço). Clique simples num item navega; duplo clique abre em aba nova — mesmo mecanismo de
// sempre (NavRail/SectionPanel/SubTabsBar), só que agora dentro do popover em vez de inline.
//
// O botão "Principal" da GuiasBar saiu junto (ver components/GuiasBar.tsx) — "Painel", fixo no
// topo deste menu, cumpre o mesmo papel de "voltar para a visão principal".
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

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
    setOpen(false);

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
    <div className="h-9 shrink-0 flex items-center bg-grafite-800 px-2 relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip="Menu"
        data-tip-pos="bottom"
        className="flex items-center gap-1.5 py-1.5 pr-1.5 -ml-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        <LumenMark size={18} />
        <ChevronDown size={13} className={clsx("text-menu-tx transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-2 top-full mt-1.5 w-56 bg-sf rounded-xl border border-regua shadow-menu z-50 overflow-hidden py-1">
          <Link
            href="/painel"
            onClick={(e) => handleClick(e, "/painel", "Painel", "painel")}
            className={clsx(
              "flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold border-b border-regua mb-1 transition-colors",
              currentSection === "painel" ? "text-acao" : "text-tx hover:bg-sf-apoio"
            )}
          >
            <LayoutDashboard size={15} /> Painel
          </Link>
          {visibleSections.map((section) => {
            const active = currentSection === section.key;
            const Icon = section.icon;
            return (
              <Link
                key={section.key}
                href={section.items[0].href}
                onClick={(e) => handleClick(e, section.items[0].href, section.label, section.key)}
                className={clsx(
                  "flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors",
                  active ? "text-acao font-semibold bg-acao-bg" : "text-tx font-medium hover:bg-sf-apoio"
                )}
              >
                <Icon size={15} className="shrink-0" />
                {section.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
