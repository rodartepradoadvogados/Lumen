import type { LucideIcon } from "lucide-react";
import { CalendarDays, MessagesSquare, Briefcase, Wallet, BarChart3 } from "lucide-react";
import type { OfficeModules } from "@/lib/officeModules";

// Modelo de navegação do rail (components/NavRail.tsx) + abas de seção
// (components/PageSectionTabs.tsx, no topo do conteúdo — substitui o antigo painel lateral de
// 190px, components/SectionPanel.tsx, removido no redesenho Modernist) — ver proposta de
// remodelação do portal aprovada em 2026-08-08 e documento 02 do handoff do redesenho. Em vez de
// categorias com sub-abas que expandiam sozinhas na barra lateral, são 6 SEÇÕES (uma por ícone
// do rail), cada uma com uma lista curta de itens.
//
// "Publicações" aparece em duas seções (Comunicação e Jurídico) — é a MESMA rota /publicacoes,
// só dois pontos de entrada pra dois jeitos de pensar (fila de comunicação x visão processual).
//
// subItems (herdado do modelo antigo) continua existindo só para os dois itens que não têm
// nenhuma navegação própria dentro da página de destino (Relatórios e Configurações, ambos
// filtrados por `?secao=`) — os demais itens que antes tinham subItems (Atendimento por status,
// Processos por natureza, Produtividade por aba) já ganharam abas/chips DENTRO da própria
// página faz tempo, então viram link simples aqui, sem perder alcance nenhum.
export type SubNavItem = {
  label: string;
  value?: string;
  adminOnly?: boolean;
  financeOnly?: boolean;
  // Exceção pontual a adminOnly: além de isAdmin, também libera pro suporte da plataforma em
  // sessão mascarada (ver lib/supportCapabilities.ts:canConfigureIntegrations) — só usado no
  // sub-item "Modelos & Integrações".
  configOnly?: boolean;
};

export type SectionPanelItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  moduleKey?: keyof OfficeModules;
  subParam?: string;
  subDefaultValue?: string;
  subItems?: SubNavItem[];
};

export type SectionKey = "agenda" | "comunicacao" | "juridico" | "financeiro" | "gestao";

export type SectionDef = {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  items: SectionPanelItem[];
};

export const RAIL_SECTIONS: SectionDef[] = [
  {
    key: "agenda",
    label: "Agenda",
    icon: CalendarDays,
    items: [
      { href: "/agenda", label: "Calendário" },
      { href: "/kanban", label: "Kanban" },
      { href: "/alertas", label: "Alertas" },
    ],
  },
  {
    key: "comunicacao",
    label: "Comunicação",
    icon: MessagesSquare,
    items: [
      { href: "/publicacoes", label: "Publicações" },
      { href: "/atendimento", label: "Atendimentos", moduleKey: "atendimento" },
      { href: "/atendimento/funil", label: "Funil comercial", moduleKey: "atendimento" },
      { href: "/contatos", label: "Contatos" },
    ],
  },
  {
    key: "juridico",
    label: "Jurídico",
    icon: Briefcase,
    items: [
      { href: "/publicacoes", label: "Publicações e andamentos" },
      { href: "/processos", label: "Processos e casos" },
      { href: "/assessoria", label: "Assessoria jurídica", moduleKey: "assessoria" },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    items: [
      { href: "/financeiro/despesas", label: "Despesas" },
      { href: "/financeiro/receitas", label: "Receitas" },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de caixa" },
      { href: "/financeiro/dre", label: "DRE" },
      { href: "/financeiro/livro-caixa", label: "Livro caixa" },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    icon: BarChart3,
    items: [
      {
        href: "/relatorios",
        label: "Relatórios",
        subParam: "secao",
        subDefaultValue: "produtividade",
        subItems: [
          { label: "Personalizado", value: "personalizado" },
          { label: "Produtividade", value: "produtividade" },
          { label: "Processos", value: "processos" },
          { label: "Funil Comercial", value: "funil" },
          { label: "Publicações", value: "publicacoes" },
          { label: "Financeiro", value: "financeiro", financeOnly: true },
        ],
      },
      { href: "/produtividade", label: "Produtividade" },
      {
        href: "/configuracoes",
        label: "Configurações",
        subParam: "secao",
        subDefaultValue: "geral",
        subItems: [
          { label: "Equipe", value: "equipe", adminOnly: true },
          { label: "Financeiro", value: "financeiro", adminOnly: true },
          { label: "Geral", value: "geral" },
          { label: "Workflows", value: "workflows", adminOnly: true },
          { label: "Blog Jurídico", value: "blog", adminOnly: true },
          { label: "Modelos & Integrações", value: "modelos", configOnly: true },
        ],
      },
    ],
  },
];

// Financeiro (a SEÇÃO inteira) só aparece com acesso financeiro — mesmo critério de sempre
// (isAdmin || financeAccess). Não há adminOnly/moduleKey nos outros 4: sempre visíveis.
export function isSectionVisible(
  section: SectionDef,
  { hasFinanceAccess, modules }: { hasFinanceAccess: boolean; modules: OfficeModules }
): boolean {
  if (section.key === "financeiro") return hasFinanceAccess;
  return section.items.some((item) => (!item.adminOnly || hasFinanceAccess) && (!item.moduleKey || modules[item.moduleKey]));
}

export function visibleSectionItems(
  section: SectionDef,
  { hasFinanceAccess, modules }: { hasFinanceAccess: boolean; modules: OfficeModules }
): SectionPanelItem[] {
  return section.items.filter((item) => (!item.adminOnly || hasFinanceAccess) && (!item.moduleKey || modules[item.moduleKey]));
}

// Deriva a seção ativa a partir do pathname — não é estado próprio (ver README da proposta:
// "secao ... derivado do pathname"). "painel" é tratado à parte pelo NavRail (não é uma seção
// deste array: é o único ícone que RECOLHE o painel em vez de abri-lo).
//
// `/publicacoes` aparece em duas seções (Comunicação e Jurídico, ver comentário acima) — por
// pathname sozinho essa ambiguidade não tem resposta certa, então `preferred` (a seção já ativa
// ANTES da navegação) desempata: se ela também é dona da rota nova, ela vence, em vez de sempre
// cair na primeira do array. Sem isso, clicar em "Jurídico" (que só tem um item de entrada
// exclusivo dele além de /publicacoes) navegava pra /publicacoes e a seção ativa "voltava"
// sozinha pra Comunicação assim que o pathname mudava — só o 2º clique (já dentro de
// /processos, sem ambiguidade) ficava certo.
export function sectionForPathname(
  pathname: string | null,
  preferred?: SectionKey | "painel" | null
): SectionKey | "painel" | null {
  if (!pathname) return null;
  if (pathname.startsWith("/painel")) return "painel";
  const matches = RAIL_SECTIONS.filter((section) =>
    section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
  if (matches.length === 0) return null;
  if (preferred && matches.some((section) => section.key === preferred)) return preferred;
  return matches[0].key;
}
