import type { LucideIcon } from "lucide-react";
import { CalendarDays, Scale, Landmark, BarChart3, Headset, FileSignature } from "lucide-react";
import type { OfficeModules } from "@/lib/officeModules";

// Modelo de navegação do rail (components/NavRail.tsx) + abas de seção
// (components/PageSectionTabs.tsx, no topo do conteúdo — substitui o antigo painel lateral de
// 190px, components/SectionPanel.tsx, removido no redesenho Modernist) — ver proposta de
// remodelação do portal aprovada em 2026-08-08 e documento 02 do handoff do redesenho. Em vez de
// categorias com sub-abas que expandiam sozinhas na barra lateral, são 4 SEÇÕES (uma por ícone
// do rail), cada uma com uma lista curta de itens, MAIS dois ícones "portais" fora de qualquer
// seção (RAIL_STANDALONE, abaixo).
//
// ATÉ 2026-09-16 "Publicações" aparecia em DUAS seções (Comunicação e Jurídico), apontando para a
// MESMA rota /publicacoes — a entrada duplicada saiu de Jurídico, e a seção "Comunicação" (Inbox)
// concentrou Publicações, Contatos e o item fundido de Atendimento.
//
// REORGANIZAÇÃO DO RAIL — pedido do dono, 24/09/2026 (três pedidos, uma mudança só):
//
//   1. Publicações passa a viver em JURÍDICO, como primeira sub-aba — a seção "Comunicação"
//      (Inbox) deixou de fazer sentido com só dois dos três itens restando nela.
//   2. Contatos passa a viver em GESTÃO, e a ORDEM da seção Gestão passou a ser fixada pelo dono:
//      Configurações, Conexões, Contatos, Produtividade, Relatórios — nesta ordem exata.
//   3. Atendimento (que já estava fundido num item só, ver comentário mais abaixo) e
//      Peticionamento (que já morava em Jurídico, com layout e permissão PRÓPRIOS) SAEM de
//      qualquer seção e viram os dois ícones "portais" do rail — RAIL_STANDALONE — porque os dois
//      "abrem abas novas, e são funcionalidades caras ao Lúmen" (nunca a navegação em-página do
//      resto do rail).
//
// Com isso a seção "Comunicação" (SectionKey "comunicacao") DEIXOU DE EXISTIR — o rail passou de
// 6 ícones (Painel + 5 seções) + Ajustes fixo no pé, para: logo (que também é o link do Painel,
// sem ícone duplicado ao lado), 4 seções (Agenda, Jurídico, Financeiro, Gestão), separador, os
// dois ícones-portal (Atendimento, Peticionamento) — e SEM Ajustes fixo no pé (duplicava Gestão,
// que agora abre direto em Configurações, seu primeiro item). Ver components/NavRail.tsx.
//
// NENHUM ITEM MUDOU DE URL. A régua de acesso de cada item (adminOnly/moduleKey/atendimentoOnly/
// abrirEmNovaAba) viajou junto com ele — mover um item de seção não pode alargar nem estreitar
// quem o enxerga, só reorganizar onde ele aparece (ver lib/testes/navegacaoRail.teste.ts).
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
};

export type SectionPanelItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  /** Item do Atendimento: qualquer um dos três níveis menos "nenhum". */
  atendimentoOnly?: boolean;
  /** Item do Atendimento que exige ver o escritório INTEIRO — o funil comercial. */
  atendimentoTotal?: boolean;
  moduleKey?: keyof OfficeModules;
  subParam?: string;
  subDefaultValue?: string;
  subItems?: SubNavItem[];
  /**
   * ABRE EM ABA NOVA DO NAVEGADOR — decisão do dono para o Peticionamento (ver
   * app/peticionamento/layout.tsx): "sensação de sair do Lúmen", nunca a navegação em-página
   * (router.push/openTab do components/TabsProvider.tsx) que troca só o conteúdo desta MESMA
   * aba/processo — fechar ou usar a aba de destino não pode interferir em nada no uso do Lúmen.
   * Quem consome este item (PageSectionTabs, GlobalSearch) precisa renderizar `<a target="_blank"
   * rel="noopener">` de verdade para este, nunca passar pelo mecanismo comum de clique único/
   * duplo clique dos demais itens.
   */
  abrirEmNovaAba?: boolean;
  /**
   * Ícone PRÓPRIO do item — usado só pelos dois itens de RAIL_STANDALONE abaixo (Atendimento,
   * Peticionamento), que são ícones do rail por si mesmos, fora de qualquer SectionDef (que já
   * carrega o próprio `icon` para o ícone da seção). Os demais itens (dentro de RAIL_SECTIONS)
   * não precisam disto: eles só aparecem como aba de texto em PageSectionTabs/GlobalSearch.
   */
  icon?: LucideIcon;
};

export type SectionKey = "agenda" | "juridico" | "financeiro" | "gestao";

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
    key: "juridico",
    label: "Jurídico",
    // Balança no lugar da pasta genérica (Briefcase) — pasta poderia ser qualquer sistema de
    // gestão de negócio; balança só tem uma leitura possível.
    icon: Scale,
    // Publicações passou a ser a PRIMEIRA sub-aba (pedido do dono, 24/09/2026) — antes vivia na
    // seção "Comunicação", que deixou de existir (ver comentário no topo do arquivo). A rota não
    // mudou (/publicacoes), e o item continua sem restrição nenhuma (nem adminOnly, nem
    // moduleKey): estava sempre visível em Comunicação, e continua sempre visível aqui — mover de
    // seção não alarga nem estreita quem vê.
    items: [
      { href: "/publicacoes", label: "Publicações" },
      { href: "/processos", label: "Processos e casos" },
      { href: "/assessoria", label: "Assessoria jurídica", moduleKey: "assessoria" },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    // Banco (Landmark) no lugar da carteira (Wallet) — lê como instituição financeira, mais
    // alinhado ao Financeiro do escritório (contas, fluxo de caixa) do que a um gasto pessoal.
    icon: Landmark,
    items: [
      // O hub do Financeiro era órfão do rail: a única tela com os quatro agregados do escritório
      // só era alcançável por um link pequeno e cinza acima do título das sub-páginas. Agora é o
      // primeiro item da seção, e portanto o destino do ícone.
      { href: "/financeiro", label: "Resumo" },
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
    // ORDEM FIXADA PELO DONO, 24/09/2026 (da esquerda para a direita): Configurações, Conexões,
    // Contatos, Produtividade, Relatórios. Configurações virou o PRIMEIRO item — e por isso é
    // para onde o ícone de Gestão do rail agora navega (`section.items[0].href`), o que também é
    // o que aposenta o antigo atalho fixo "Ajustes" no pé do rail sem perder alcance nenhum (ver
    // components/NavRail.tsx): clicar em Gestão já abre Configurações.
    items: [
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
        ],
      },
      // Rota nova do documento 04 (handoff do redesenho Modernist) — sempre visível no rail, como
      // Configurações: a permissão de verdade (isAdmin || canConfigureIntegrations, ver
      // lib/supportCapabilities.ts) é decidida dentro da própria página, não escondendo o link do
      // menu (mesmo padrão que Configurações já usa — a maior parte do conteúdo dela também exige
      // isAdmin, e o link continua aparecendo pra todo mundo).
      { href: "/conexoes", label: "Conexões" },
      // Contatos passou a viver aqui (pedido do dono, 24/09/2026) — antes vivia na seção
      // "Comunicação", que deixou de existir. Mesma rota (/contatos), mesma ausência de
      // restrição: estava sempre visível lá, e continua sempre visível aqui.
      { href: "/contatos", label: "Contatos" },
      { href: "/produtividade", label: "Produtividade" },
      {
        href: "/relatorios",
        label: "Relatórios",
        subParam: "secao",
        subDefaultValue: "produtividade",
        subItems: [
          { label: "Personalizado", value: "personalizado" },
          { label: "Produtividade", value: "produtividade" },
          { label: "Processos", value: "processos" },
          { label: "Triagem", value: "funil" },
          { label: "Publicações", value: "publicacoes" },
          { label: "Financeiro", value: "financeiro", financeOnly: true },
        ],
      },
    ],
  },
];

// OS DOIS ÍCONES-PORTAL DO RAIL — fora de qualquer seção (ver o comentário no topo do arquivo).
// Atendimento e Peticionamento têm em comum exatamente o que os tira de RAIL_SECTIONS: os dois
// SEMPRE abrem em ABA NOVA do navegador (abrirEmNovaAba — nunca a navegação em-página do resto do
// rail) e têm layout/permissão PRÓPRIOS na própria rota (app/atendimento-central/layout.tsx,
// app/peticionamento/layout.tsx) — o item aqui é só a PORTA de entrada do rail; a régua de acesso
// de verdade mora na rota. Renderizados por components/NavRail.tsx como `<a target="_blank"
// rel="noopener">`, nunca `<Link>` (ver lib/testes/navegacaoRail.teste.ts).
export const RAIL_STANDALONE: SectionPanelItem[] = [
  // Item fundido de Atendimento (Triagem + Atendimentos numa tela só, ver
  // app/atendimento-central/page.tsx) — até 24/09/2026 vivia dentro da seção "Comunicação", só
  // alcançável pela barra de sub-abas ou pela paleta ⌘K, nunca por ícone PRÓPRIO do rail. Virar
  // ícone-portal é só um caminho novo e mais curto para o MESMO lugar — a régua de acesso não
  // mudou nem uma vírgula: continua exigindo só `atendimentoOnly` (o portão mais baixo, igual ao
  // antigo "Atendimentos"), nunca `atendimentoTotal` nem `adminOnly` (ver lib/acessoAtendimento.ts
  // e o comentário histórico em lib/testes/atendimentoCentral.teste.ts sobre a Triagem).
  {
    href: "/atendimento-central",
    label: "Atendimento",
    icon: Headset,
    moduleKey: "atendimento",
    atendimentoOnly: true,
    abrirEmNovaAba: true,
  },
  // Peticionamento — até 24/09/2026 vivia como sub-aba de Jurídico (sempre visível no menu,
  // mesmo padrão de "Configurações": a régua de verdade é `podeAcessarAba` dentro do próprio
  // layout, ver app/peticionamento/layout.tsx). Sem flag de visibilidade aqui — continua sempre
  // visível no rail, exatamente como estava.
  { href: "/peticionamento", label: "Peticionamento", icon: FileSignature, abrirEmNovaAba: true },
];

// Financeiro (a SEÇÃO inteira) só aparece com acesso financeiro — mesmo critério de sempre
// (isAdmin || financeAccess). Não há adminOnly/moduleKey nos outros 4: sempre visíveis.
export type ContextoDeVisibilidade = {
  hasFinanceAccess: boolean;
  modules: OfficeModules;
  /** Tem alguma porta aberta no Atendimento. Ausente vale FALSO. */
  podeAtendimento?: boolean;
  /** Vê o Atendimento do escritório inteiro. Ausente vale FALSO. */
  veTodoAtendimento?: boolean;
};

// Exportada (deixou de ser função privada do módulo) para RAIL_STANDALONE também poder ser
// filtrado pelo mesmo critério dos itens de RAIL_SECTIONS — os dois ícones-portal do rail usam a
// MESMA régua de acesso que os itens de seção sempre usaram (ver components/NavRail.tsx e
// components/GlobalSearch.tsx), só que fora de uma SectionDef.
export function itemVisivel(item: SectionPanelItem, ctx: ContextoDeVisibilidade): boolean {
  if (item.adminOnly && !ctx.hasFinanceAccess) return false;
  if (item.moduleKey && !ctx.modules[item.moduleKey]) return false;
  // Fechado por padrão: um contexto que esqueceu de informar esconde o item em vez de mostrá-lo.
  if (item.atendimentoOnly && ctx.podeAtendimento !== true) return false;
  if (item.atendimentoTotal && ctx.veTodoAtendimento !== true) return false;
  return true;
}

export function isSectionVisible(section: SectionDef, ctx: ContextoDeVisibilidade): boolean {
  if (section.key === "financeiro") return ctx.hasFinanceAccess;
  return section.items.some((item) => itemVisivel(item, ctx));
}

export function visibleSectionItems(section: SectionDef, ctx: ContextoDeVisibilidade): SectionPanelItem[] {
  return section.items.filter((item) => itemVisivel(item, ctx));
}

/** Os itens de RAIL_STANDALONE que `ctx` autoriza ver — mesmo filtro de visibleSectionItems. */
export function visibleStandaloneItems(ctx: ContextoDeVisibilidade): SectionPanelItem[] {
  return RAIL_STANDALONE.filter((item) => itemVisivel(item, ctx));
}

// Deriva a seção ativa a partir do pathname — não é estado próprio (ver README da proposta:
// "secao ... derivado do pathname"). "painel" é tratado à parte pelo NavRail (não é uma seção
// deste array: é o único ícone que RECOLHE o painel em vez de abri-lo).
//
// Com a entrada duplicada removida de Jurídico, nenhuma rota pertence a duas seções: o pathname
// basta, e `preferred` deixou de existir. Enquanto ele existia, a MESMA URL podia renderizar abas
// diferentes conforme a porta de entrada — estado invisível decidindo navegação visível.
export function sectionForPathname(pathname: string | null): SectionKey | "painel" | null {
  if (!pathname) return null;
  if (pathname.startsWith("/painel")) return "painel";
  const match = RAIL_SECTIONS.find((section) =>
    section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
  return match ? match.key : null;
}

// Rótulo composto "Seção - Item" para as guias internas (components/TabTitleSync.tsx via
// lib/navItems.ts:resolveTabLabel, e o chip da view "Principal" em components/GuiasBar.tsx) —
// pedido do dono do produto: a guia mostra até o 2º nível da hierarquia (aba + sub-aba), nunca
// mais fundo. Ex.: "/contatos/clientes" resolve pro MESMO "Gestão - Contatos" que
// "/contatos" puro — "Clientes" é uma aba dentro da própria página de Contatos (3º nível), não
// uma rota própria em RAIL_SECTIONS; o mesmo vale para `?secao=` de Relatórios/Configurações.
//
// `def.items.length < 2` usa a MESMA condição que PageSectionTabs já usa pra decidir se mostra a
// barra de sub-abas (sem sub-aba visível na tela, "Seção - Item" ficaria redundante) — com a
// lista BRUTA de itens, sem levar em conta módulo contratado/admin, porque esta função roda sem
// esse contexto (dentro do <iframe> da guia, só conhece a URL); nenhuma seção hoje cai pra 1 item
// só por causa de gating, então a aproximação não erra na prática.
export function resolveTwoLevelLabel(pathname: string): string | null {
  if (pathname.startsWith("/painel")) return "Painel";
  const section = sectionForPathname(pathname);
  if (!section || section === "painel") return null;
  const def = RAIL_SECTIONS.find((s) => s.key === section);
  if (!def) return null;
  const item = def.items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (!item || def.items.length < 2) return def.label;
  return `${def.label} - ${item.label}`;
}

// A FAIXA DA SEÇÃO saiu daqui por completo em 17/09/2026.
//
// Ela nasceu como "a cor que diz ONDE o visitante está" e, na prática, só chegou a pintar a ABA
// selecionada. Quando o dono trocou a aba por uma cor única (bronze), o maquinário ficou sem
// chamador e saiu; ficou só o campo `faixa` de cada seção, como registro de qual tom pertencia a
// qual. Agora que dois dos cinco tons foram removidos por serem roxos, esse registro passou a
// descrever uma paleta que não existe mais — e um dado que ninguém lê e que está errado é pior
// que dado nenhum. O registro de quais faixas existem é a paleta em /configuracoes, que lê
// `var(--faixa-*)` direto de app/globals.css.
