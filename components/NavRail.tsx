"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, ExternalLink, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import LumenMark from "@/components/LumenMark";
import { useTabs } from "@/components/TabsProvider";
import {
  RAIL_SECTIONS,
  isSectionVisible,
  sectionForPathname,
  visibleStandaloneItems,
  type SectionKey,
  type SectionPanelItem,
} from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// Rail — única navegação do app desktop (os antigos modos Régua/Bancada saíram, ver
// components/AppShell.tsx). As 4 seções de lib/navSections.ts navegam para o primeiro item de
// cada uma; components/PageSectionTabs.tsx mostra os demais itens da seção ativa como abas no
// topo do conteúdo. 56px sem rótulo em telas médias (768–1023px), 76px com rótulo sempre visível
// a partir de 1024px — documento 02 do handoff do redesenho Modernist.
//
// REORGANIZAÇÃO DO RAIL — pedido do dono, 24/09/2026 (ver o comentário longo em
// lib/navSections.ts para as três mudanças de sub-aba que motivaram isto):
//
//   - O ícone de "Painel" saiu — o logo do Lúmen, no topo, já navega para /painel, e ter os dois
//     lado a lado era o mesmo destino contado duas vezes ("pois ele tem a mesma funcionalidade de
//     clicar no logo de Lúmen, então é desnecessário", nas palavras do dono).
//   - O atalho fixo "Ajustes", no pé, saiu pelo mesmo motivo: Configurações virou o PRIMEIRO item
//     de Gestão (lib/navSections.ts), então clicar no ícone de Gestão já abre Configurações — os
//     dois iam para o mesmo lugar.
//   - Depois das 4 seções, SEPARADOS delas, aparecem os dois ícones-portal — Atendimento e
//     Peticionamento (RAIL_STANDALONE) — porque "abrem abas novas, e são funcionalidades caras ao
//     Lúmen": nunca a navegação em-página do resto do rail, sempre `<a target="_blank">` de
//     verdade. O separador e o tratamento visual dos dois vieram de uma sessão de polish dedicada
//     (skill impeccable) — ver StandaloneRailButton, abaixo.
export default function NavRail({
  hasFinanceAccess = true,
  podeAtendimento = false,
  veTodoAtendimento = false,
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
  /** Fechado por padrão: quem esquecer de passar esconde o Atendimento, e não o contrário. */
  podeAtendimento?: boolean;
  veTodoAtendimento?: boolean;
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

  const visibleSections = RAIL_SECTIONS.filter((s) => isSectionVisible(s, { hasFinanceAccess, modules, podeAtendimento, veTodoAtendimento }));
  // Mesma régua de acesso de sempre (ver lib/navSections.ts:itemVisivel) — Atendimento continua
  // fechado por padrão para quem não tem `atendimentoOnly`, exatamente como antes de virar ícone
  // próprio do rail; Peticionamento continua sempre visível aqui (a régua de verdade é a rota).
  const standaloneItems = visibleStandaloneItems({ hasFinanceAccess, modules, podeAtendimento, veTodoAtendimento });
  const currentSection = activeSection ?? sectionForPathname(pathname);

  return (
    <>
      <button
        onClick={onOpenMobile}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center bg-gaveta text-gaveta-tinta shadow-menu"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-gaveta-fundo" onClick={onCloseMobile} />}

      {/* Grafite nos dois temas, fundo fixo (não usa --sf-*, que troca com o tema: o rail é
          sempre escuro, Manhã e Noite) — documento 02 do handoff. */}
      <aside
        className={clsx(
          "w-16 md:w-14 lg:w-[112px] shrink-0 flex flex-col items-center h-full fixed md:static top-0 left-0 z-50 bg-gaveta transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button onClick={onCloseMobile} className="md:hidden absolute top-3 right-2 text-gaveta-tinta-2 hover:text-gaveta-tinta" aria-label="Fechar menu">
          <X size={16} />
        </button>

        <Link href="/painel" onClick={(e) => handleClick(e, "/painel", "Painel", "painel")} className="pt-4 pb-3">
          <LumenMark size={38} />
        </Link>

        {/* `overflow-x-hidden` explícito: a barra de rolagem HORIZONTAL que o dono viu no pé do rail
            (17/09/2026) nascia aqui. `overflow-y-auto` sozinho deixa o eixo x em `auto` também, e
            o rótulo "Comunicação" (seção removida em 24/09/2026, ver lib/navSections.ts) — escrito
            para não quebrar — transbordava os 62px úteis que sobravam num rail de 76px. Medido no
            Chromium: 93px de texto em 53px de caixa, conteúdo de 104px numa faixa de 75px. Eram a
            mesma falha contada como duas queixas. A correção de verdade é a largura (112px acima,
            onde a palavra cabia inteira em uma linha); este `overflow-x-hidden` é o cinto de
            segurança para o dia em que alguém acrescentar um rótulo mais longo — como
            "Peticionamento" (14 caracteres), hoje o mais longo do rail, ainda não medido no
            Chromium com este `overflow-x-hidden` como única rede. */}
        <nav className="flex-1 flex flex-col items-center gap-2 w-full px-2 pt-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {visibleSections.map((section) => {
            // O número da Agenda é compromisso de hoje MAIS atrasado, e nada além disso (pedido
            // do dono, 2026-09-16 — ver getAgendaBadgeCount em lib/alerts.ts). Antes somava
            // `getAlertsCount` por cima, que inclui publicação não lida: o MESMO item aparecia
            // contado em dois ícones vizinhos, Agenda e Comunicação. Publicações (o item que
            // gerava esse número) mudou de seção em 24/09/2026 — o badge de não lidas foi junto,
            // e agora acende em Jurídico, seção que passou a hospedar Publicações.
            const badge =
              section.key === "agenda"
                ? agendaBadgeCount
                : section.key === "juridico"
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

          {standaloneItems.length > 0 && (
            <>
              {/* SEPARADOR entre as 4 seções e os dois ícones-portal — decisão de polish (skill
                  impeccable, 24/09/2026): um filete curto e centralizado, não a largura toda do
                  rail, para ler como uma pausa dentro do MESMO grupo de navegação, e não como o
                  fim de uma caixa. `gaveta-linha` é o token de filete que já existe para o rail
                  (ver components/NavRail.tsx mais acima) — nunca hex cru, retematiza junto com o
                  resto do rail (que é grafite fixo, mas o filete precisa do MESMO tom nos dois
                  temas do produto, e é isso que o token garante). */}
              <div role="separator" aria-hidden="true" className="w-6 lg:w-10 h-px my-1 shrink-0 bg-gaveta-linha" />
              {standaloneItems.map((item) => (
                <StandaloneRailButton key={item.href} item={item} />
              ))}
            </>
          )}
        </nav>

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
  icon: LucideIcon;
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
        "relative w-full flex flex-col items-center gap-1.5 py-2 rounded-[2px] transition-colors",
        // O FUNDO DO ITEM não muda mais com a seleção — quem responde por ela é a caixa do ícone,
        // logo abaixo. Antes o item ativo era uma pílula bordô inteira ("Editorial fino", 2026-08),
        // o que gastava a cor da AÇÃO num estado de navegação: bordô é a marca e é o risco, e o
        // rail o usava para dizer "você está aqui". Escolha do dono em 17/09/2026, entre três
        // opções mostradas em artefato.
        active ? "text-gaveta-tinta font-bold" : "text-rail-tx hover:bg-gaveta-fundo hover:text-gaveta-tinta"
      )}
    >
      {/* A CAIXA — existe só no item selecionado, e some por completo nos demais (pedido explícito
          do dono: "mostra o colorido com caixa apenas quando selecionado; quando não selecionado,
          mantenha sem caixa"). Bronze, o mesmo `--guia-ativa` da aba de ficha: um lugar aceso e
          uma linguagem só para "é este que está aberto". O quadrado de 36px existe nos dois
          estados, sem borda nem fundo quando inativo, para o ícone não pular de posição na troca. */}
      <span
        className={clsx(
          "relative h-9 w-9 flex items-center justify-center rounded-[2px] transition-colors",
          active && "bg-guia-ativa text-rotulo"
        )}
      >
        <Icon size={22} strokeWidth={1.6} />
        {badge > 0 && (
          <span // Bordô, não vermelho (pedido do dono, 2026-09-16): contagem não é risco, e o vermelho
          // fica reservado a prazo vencido. O bordô é escuro nos dois temas, então o rótulo claro
          // vale sempre.
          className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-acao text-acao-tx text-etiqueta font-bold flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      {/* `whitespace-nowrap`: com 112px de rail o rótulo mais longo ("Comunicação") cabe inteiro
          numa linha, e é assim que ele deve ficar — quebrar "Comunicaç/ão" seria trocar um defeito
          por outro. Renomear a seção para caber num espaço menor foi considerado e recusado: o
          espaço é que estava errado. */}
      <span className="hidden lg:block font-display font-semibold text-etiqueta leading-none tracking-wide whitespace-nowrap">{label}</span>
    </Link>
  );
}

/**
 * Os dois ícones-portal (Atendimento, Peticionamento) — SEMPRE `<a target="_blank"
 * rel="noopener">`, nunca `<Link>`/router.push: os dois abrem em aba NOVA do navegador de
 * verdade (lib/navSections.ts:abrirEmNovaAba), mesma trava que já vale para PageSectionTabs e
 * GlobalSearch. Por isso este componente não recebe `onClick`/`active` nenhum — não há clique
 * único/duplo aqui para distinguir (não navega esta aba, então nunca fica "selecionado"), e o
 * `<a>` nativo já cuida do resto sozinho.
 *
 * O indicador de "abre em aba nova" (ExternalLink em miniatura, canto inferior direito do
 * ícone) é decisão de polish (skill impeccable, 24/09/2026): mesmo glifo que o resto do produto
 * já usa para "isto leva a outro lugar" (ver components/DocumentTemplatesManager.tsx e outros),
 * em vez de inventar um símbolo novo só para o rail — pequeno (9px) e em `gaveta-tinta-2` (a MESMA
 * tinta apagada do rótulo/rótulo secundário do rail), para ler como detalhe e não como um segundo
 * badge competindo com o de contagem (que é bordô e maior, e significa outra coisa: "há algo
 * pendente aqui").
 */
function StandaloneRailButton({ item }: { item: SectionPanelItem }) {
  const Icon = item.icon!;
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener"
      data-tip={`${item.label} (abre em nova aba)`}
      className="relative w-full flex flex-col items-center gap-1.5 py-2 rounded-[2px] transition-colors text-rail-tx hover:bg-gaveta-fundo hover:text-gaveta-tinta"
    >
      <span className="relative h-9 w-9 flex items-center justify-center rounded-[2px]">
        <Icon size={22} strokeWidth={1.6} />
        <ExternalLink
          size={9}
          strokeWidth={2.5}
          className="absolute -bottom-0.5 -right-0.5 text-gaveta-tinta-2"
          aria-hidden="true"
        />
      </span>
      <span className="hidden lg:block font-display font-semibold text-etiqueta leading-none tracking-wide whitespace-nowrap">
        {item.label}
      </span>
    </a>
  );
}
