"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, Menu, Settings, X } from "lucide-react";
import clsx from "clsx";
import LumenMark from "@/components/LumenMark";
import { useTabs } from "@/components/TabsProvider";
import { RAIL_SECTIONS, isSectionVisible, sectionForPathname, type SectionKey } from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Rail — única navegação do app desktop (os antigos modos Régua/Bancada saíram, ver
// components/AppShell.tsx). "Painel" e as 5 seções de lib/navSections.ts navegam para o
// primeiro item de cada uma; components/PageSectionTabs.tsx mostra os demais itens da seção
// ativa como abas no topo do conteúdo. "Ajustes", fixo no pé, é o atalho direto pra
// Configurações — os outros itens de Gestão (Relatórios/Produtividade) continuam só dentro da
// seção. 56px sem rótulo em telas médias (768–1023px), 76px com rótulo sempre visível a partir
// de 1024px — documento 02 do handoff do redesenho Modernist.
export default function NavRail({
  hasFinanceAccess = true,
  unreadPublications = 0,
  totalAlerts = 0,
  todayAgendaCount = 0,
  modules,
  activeSection,
  onSelectSection,
  mobileOpen,
  onCloseMobile,
  onOpenMobile,
}: {
  hasFinanceAccess?: boolean;
  unreadPublications?: number;
  totalAlerts?: number;
  todayAgendaCount?: number;
  modules: OfficeModules;
  activeSection: SectionKey | "painel" | null;
  onSelectSection: (section: SectionKey | "painel") => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenMobile: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { openTab, goToLiveView } = useTabs();

  // Mesmo mecanismo de distinguir clique simples de duplo clique que a Sidebar antiga usava
  // (ver components/AppShell.tsx/TabsProvider.tsx para o resto do fluxo de abas internas):
  // todo clique é interceptado; se um 2º clique chegar dentro da janela, é duplo clique (abre
  // aba nova); senão, decorrido o prazo, navega normalmente.
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
  const onConfiguracoes = pathname === "/configuracoes" || pathname?.startsWith("/configuracoes/");

  return (
    <>
      <button
        onClick={onOpenMobile}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center bg-grafite-800 text-white shadow-menu"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-grafite-900/50" onClick={onCloseMobile} />}

      {/* Grafite nos dois temas, fundo fixo (não usa --sf-*, que troca com o tema: o rail é
          sempre escuro, Manhã e Noite) — documento 02 do handoff. */}
      <aside
        className={clsx(
          "w-16 md:w-14 lg:w-[76px] shrink-0 flex flex-col items-center h-full fixed md:static top-0 left-0 z-50 bg-grafite-800 transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button onClick={onCloseMobile} className="md:hidden absolute top-3 right-2 text-white/60 hover:text-white" aria-label="Fechar menu">
          <X size={16} />
        </button>

        <Link href="/painel" onClick={(e) => handleClick(e, "/painel", "Painel", "painel")} className="pt-4 pb-3">
          <LumenMark size={38} />
        </Link>

        <nav className="flex-1 flex flex-col items-center gap-1 w-full px-2 overflow-y-auto scrollbar-thin">
          <RailButton
            href="/painel"
            label="Painel"
            icon={LayoutDashboard}
            active={currentSection === "painel"}
            onClick={(e) => handleClick(e, "/painel", "Painel", "painel")}
          />
          {visibleSections.map((section) => {
            // Seção Agenda reúne Calendário/Kanban/Alertas (lib/navSections.ts) — o badge do ícone
            // soma os dois contadores que antes apareciam em itens separados da Sidebar antiga
            // (compromissos de hoje + alertas pendentes), pra não perder nenhum dos dois sinais.
            const badge =
              section.key === "agenda"
                ? todayAgendaCount + totalAlerts
                : section.key === "comunicacao"
                  ? unreadPublications
                  : 0;
            return (
              <RailButton
                key={section.key}
                href={section.items[0].href}
                label={section.label}
                icon={section.icon}
                active={currentSection === section.key}
                badge={badge}
                onClick={(e) => handleClick(e, section.items[0].href, section.label, section.key)}
              />
            );
          })}
        </nav>

        {/* Ajustes — atalho fixo no pé pra Configurações, fora da rolagem das seções acima
            (documento 02: "Painel + as 5 seções + Ajustes no pé"). Continua contando como a
            seção "gestao" pra components/PageSectionTabs.tsx mostrar as abas certas. */}
        <div className="w-full px-2 pb-1">
          <RailButton
            href="/configuracoes"
            label="Ajustes"
            icon={Settings}
            active={onConfiguracoes}
            onClick={(e) => handleClick(e, "/configuracoes", "Configurações", "gestao")}
          />
        </div>

        <div className="pb-3 text-[8px] text-white/30 text-center px-1">v0.1</div>
      </aside>
    </>
  );
}

function RailButton({
  href,
  label,
  icon: Icon,
  active,
  badge = 0,
  onClick,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  badge?: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      data-tip={label}
      className={clsx(
        "relative w-full flex flex-col items-center gap-0.5 py-2.5 border-l-4 rounded-md transition-colors",
        active
          ? // Item ativo é fixo nos dois temas (o rail nunca clareia) — documento 02 do handoff:
            // fundo #2d2b2b (== neutro-900, mesma rampa do documento 01), filete de marca, texto
            // branco.
            "bg-neutro-900 border-marca text-white font-semibold"
          : "border-transparent text-rail-tx hover:bg-white/5 hover:text-white"
      )}
    >
      <span className="relative">
        <Icon size={17} strokeWidth={1.9} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-atencao text-white text-[9px] font-bold flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="hidden lg:block text-[8px] leading-none">{label}</span>
    </Link>
  );
}
