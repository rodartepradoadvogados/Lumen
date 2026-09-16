"use client";

import { useRef } from "react";
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
  agendaBadgeCount = 0,
  modules,
  activeSection,
  onSelectSection,
  mobileOpen,
  onCloseMobile,
  onOpenMobile,
}: {
  hasFinanceAccess?: boolean;
  unreadPublications?: number;
  agendaBadgeCount?: number;
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

  // Clique simples navega; duplo clique abre guia interna (ver AppShell/TabsProvider para o
  // resto do fluxo). Guarda o INSTANTE do último clique por destino, não um timer pendente: a
  // navegação não espera mais nada para acontecer.
  const ultimoClique = useRef<Record<string, number>>({});

  function handleClick(e: React.MouseEvent, href: string, label: string, section: SectionKey | "painel") {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    onSelectSection(section);

    // Navega NA HORA. Antes todo clique simples esperava 250ms só para descobrir se viraria um
    // duplo — numa ferramenta de oito horas por dia, isso é atraso em cada navegação do dia
    // inteiro. Agora o duplo clique continua abrindo guia, detectado DEPOIS do fato: o segundo
    // clique dentro de 300ms no mesmo destino abre a guia, e a navegação já aconteceu.
    const agora = Date.now();
    const ultimo = ultimoClique.current[href];
    if (typeof ultimo === "number" && agora - ultimo < 300) {
      delete ultimoClique.current[href];
      openTab(href, label);
      return;
    }
    ultimoClique.current[href] = agora;
    goToLiveView();
    router.push(href);
  }

  const visibleSections = RAIL_SECTIONS.filter((s) => isSectionVisible(s, { hasFinanceAccess, modules }));
  const currentSection = activeSection ?? sectionForPathname(pathname);
  const onConfiguracoes = pathname === "/configuracoes" || pathname?.startsWith("/configuracoes/");

  return (
    <>
      <button
        onClick={onOpenMobile}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center bg-gaveta text-gaveta-tinta shadow-menu"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-gaveta-fundo/60" onClick={onCloseMobile} />}

      {/* Grafite nos dois temas, fundo fixo (não usa --sf-*, que troca com o tema: o rail é
          sempre escuro, Manhã e Noite) — documento 02 do handoff. */}
      <aside
        className={clsx(
          "w-16 md:w-14 lg:w-[76px] shrink-0 flex flex-col items-center h-full fixed md:static top-0 left-0 z-50 bg-gaveta transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button onClick={onCloseMobile} className="md:hidden absolute top-3 right-2 text-gaveta-tinta-2 hover:text-gaveta-tinta" aria-label="Fechar menu">
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
            // O número da Agenda é compromisso de hoje MAIS atrasado, e nada além disso (pedido
            // do dono, 2026-09-16 — ver getAgendaBadgeCount em lib/alerts.ts). Antes somava
            // `getAlertsCount` por cima, que inclui publicação não lida: o MESMO item aparecia
            // contado em dois ícones vizinhos, Agenda e Comunicação.
            const badge =
              section.key === "agenda"
                ? agendaBadgeCount
                : section.key === "comunicacao"
                  ? unreadPublications
                  : 0;
            return (
              <RailButton
                key={section.key}
                href={section.items[0].href}
                label={section.label}
                icon={section.icon}
                // Em /configuracoes quem acende é "Ajustes", no pé. Antes os DOIS acendiam:
                // Ajustes declara a seção `gestao` e o ícone de Gestão acende com a mesma.
                active={currentSection === section.key && !(section.key === "gestao" && onConfiguracoes)}
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

        <div className="pb-3 text-etiqueta text-gaveta-tinta-2 text-center px-1">v0.1</div>
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
        // Portal Noturno (DESIGN.md): raio quase reto (2px), não o rounded-md (6px) do resto do
        // produto — exceção documentada, aplicada por componente (ver comentário em
        // tailwind.config.ts sobre por que não dá pra escopar por token aqui).
        "relative w-full flex flex-col items-center gap-0.5 py-2.5 rounded-[2px] transition-colors",
        active
          ? // Item ativo — pílula (proposta "Editorial fino"/"Pílula bordô" de 2026-08, ver
            // docs/DESIGN-SYSTEM.md): fundo bordô suave + ícone/rótulo na cor de marca, no lugar
            // do antigo fundo #2d2b2b + filete de 4px à esquerda.
            "bg-rail-marca-bg text-rail-marca font-semibold"
          : "text-rail-tx hover:bg-gaveta-fundo hover:text-gaveta-tinta"
      )}
    >
      <span className="relative">
        <Icon size={19} strokeWidth={1.5} />
        {badge > 0 && (
          <span // Contagem não é risco: o vermelho fica reservado a prazo vencido (pedido do dono,
          // 2026-09-16). O número vira uma pastilha neutra, invertida contra o rail.
          className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-gaveta-tinta text-gaveta text-etiqueta font-bold flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      {/* Barlow Condensed (Portal Noturno, DESIGN.md) — rótulo pequeno de navegação é
          exatamente o papel que a fonte condensada cumpre no CowData (número/rótulo/aba). */}
      <span className="hidden lg:block font-display font-semibold text-etiqueta leading-none tracking-wide">{label}</span>
    </Link>
  );
}
