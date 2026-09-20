"use client";

import { useRef } from "react";
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
  podeAtendimento = false,
  veTodoAtendimento = false,
  modules,
}: {
  section: SectionKey | "painel" | null;
  hasFinanceAccess: boolean;
  podeAtendimento?: boolean;
  veTodoAtendimento?: boolean;
  modules: OfficeModules;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { openTab, goToLiveView } = useTabs();

  // Mesmo mecanismo de duplo clique do rail (components/NavRail.tsx) e do antigo SectionPanel:
  // clique simples navega, um 2º clique dentro da janela abre em aba nova.
  const ultimoClique = useRef<Record<string, number>>({});

  function handleClick(e: React.MouseEvent, href: string, label: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    // Mesma correção do NavRail: navega na hora, e o duplo clique é detectado DEPOIS do fato.
    // Este arquivo tinha a mesma espera de 250ms e passou despercebido na rodada anterior.
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

  const def = section && section !== "painel" ? RAIL_SECTIONS.find((s) => s.key === section) : undefined;
  // A barra ocupa SEMPRE os mesmos 40px, mesmo quando não há aba para mostrar (o /painel, e
  // qualquer seção com um item só). Antes ela sumia, e o conteúdo da tela saltava 40px para
  // cima ao entrar no Painel e 40px para baixo ao sair — parte da mesma instabilidade que a
  // largura única resolve: o quadro da página não se mexe entre navegações.
  const items = def ? visibleSectionItems(def, { hasFinanceAccess, modules, podeAtendimento, veTodoAtendimento }) : [];
  if (!def || items.length < 2) {
    return <div className="h-10 shrink-0 border-b-2 border-regua-forte bg-sf" aria-hidden="true" />;
  }

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
              active ? "font-extrabold text-tx border-marca-tx" : "font-normal text-tx-2 border-transparent hover:text-tx"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
