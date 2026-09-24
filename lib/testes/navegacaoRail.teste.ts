import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, hrefsDeLinks } from "./executar";
import {
  RAIL_SECTIONS,
  RAIL_STANDALONE,
  itemVisivel,
  visibleStandaloneItems,
  type ContextoDeVisibilidade,
} from "@/lib/navSections";
import type { OfficeModules } from "@/lib/officeModules";

// ============================================================================
// REORGANIZAÇÃO DO RAIL — pedido do dono, 24/09/2026, três mudanças:
//
//   1. Publicações passa a ser a PRIMEIRA sub-aba de Jurídico.
//   2. Contatos passa para Gestão; a ordem de Gestão é fixada: Configurações, Conexões, Contatos,
//      Produtividade, Relatórios.
//   3. O rail vira: logo (sem ícone de Painel ao lado) → Agenda, Jurídico, Financeiro, Gestão →
//      separador → Atendimento, Peticionamento (ícones-portal, sempre aba nova) → sem Ajustes
//      fixo no pé (Gestão já abre em Configurações, seu primeiro item).
//
// Esta suíte prova a ESTRUTURA DO DADO (lib/navSections.ts) e, separadamente, o MECANISMO do
// componente que a lê (components/NavRail.tsx) — as duas coisas podem quebrar independentemente:
// o dado pode estar certo e o componente ignorá-lo (ou vice-versa). Nenhuma asserção conta
// `foco === X` de um jeito que também casaria `params.foco === X` ou coisa parecida: as buscas
// abaixo são por ESTRUTURA (arrays, `.label`, `.href`) ou por padrões suficientemente específicos
// no código-fonte, nunca por uma âncora genérica de uma palavra só.
// ============================================================================

const RAIZ = process.cwd();

const CTX = (over: Partial<ContextoDeVisibilidade> = {}): ContextoDeVisibilidade => ({
  hasFinanceAccess: true,
  modules: { financeiro: true, whatsapp: true, atendimento: true, assessoria: true } as OfficeModules,
  podeAtendimento: false,
  veTodoAtendimento: false,
  ...over,
});

// ── 1. A SEÇÃO "COMUNICAÇÃO" NÃO EXISTE MAIS, E SOBRAM EXATAMENTE 4 ─────────────────────────────

teste("RAIL_SECTIONS tem exatamente 4 seções, nesta ordem: Agenda, Jurídico, Financeiro, Gestão", () => {
  igual(RAIL_SECTIONS.map((s) => s.key), ["agenda", "juridico", "financeiro", "gestao"]);
  igual(RAIL_SECTIONS.find((s) => s.key === "comunicacao" as never), undefined, "a seção 'comunicacao' ainda existe em RAIL_SECTIONS");
});

// ── 2. PEDIDO 1 — Publicações é a PRIMEIRA sub-aba de Jurídico ──────────────────────────────────

teste("PEDIDO 1: Jurídico começa com Publicações, seguida de Processos e casos e Assessoria jurídica", () => {
  const juridico = RAIL_SECTIONS.find((s) => s.key === "juridico")!;
  igual(juridico.items.map((i) => i.label), ["Publicações", "Processos e casos", "Assessoria jurídica"]);
  igual(juridico.items[0].href, "/publicacoes", "Publicações não é mais o primeiro item — a rota mudou de posição ou de item");
});

teste("Publicações não ganhou nem perdeu restrição ao mudar de seção — sempre visível, como antes", () => {
  const publicacoes = RAIL_SECTIONS.find((s) => s.key === "juridico")!.items.find((i) => i.label === "Publicações")!;
  igual(Boolean(publicacoes.adminOnly), false);
  igual(Boolean(publicacoes.moduleKey), false);
  igual(Boolean(publicacoes.atendimentoOnly), false);
  verdade(itemVisivel(publicacoes, CTX({ hasFinanceAccess: false, modules: { financeiro: false, whatsapp: false, atendimento: false, assessoria: false } as OfficeModules })),
    "Publicações deixou de ser visível para o contexto mais restrito possível — mover de seção não pode estreitar quem vê");
});

// ── 3. PEDIDO 2 — Contatos em Gestão, na ordem exigida pelo dono ────────────────────────────────

teste("PEDIDO 2: a ordem de Gestão é EXATAMENTE Configurações, Conexões, Contatos, Produtividade, Relatórios", () => {
  const gestao = RAIL_SECTIONS.find((s) => s.key === "gestao")!;
  igual(gestao.items.map((i) => i.label), ["Configurações", "Conexões", "Contatos", "Produtividade", "Relatórios"]);
});

teste("Contatos não ganhou nem perdeu restrição ao mudar de seção — sempre visível, como antes", () => {
  const contatos = RAIL_SECTIONS.find((s) => s.key === "gestao")!.items.find((i) => i.label === "Contatos")!;
  igual(contatos.href, "/contatos");
  igual(Boolean(contatos.adminOnly), false);
  igual(Boolean(contatos.moduleKey), false);
  igual(Boolean(contatos.atendimentoOnly), false);
});

teste("Configurações virou o primeiro item de Gestão — é para lá que o ícone de Gestão do rail navega agora", () => {
  const gestao = RAIL_SECTIONS.find((s) => s.key === "gestao")!;
  igual(gestao.items[0].href, "/configuracoes", "o primeiro item de Gestão não é mais /configuracoes — o ícone de Gestão do rail passaria a abrir outra tela, e o antigo atalho 'Ajustes' não teria mesmo destino");
});

// ── 4. PEDIDO 3 (o DADO) — Atendimento e Peticionamento saem de qualquer seção ───────────────────

teste("PEDIDO 3: RAIL_STANDALONE tem Atendimento e Peticionamento, nesta ordem, e SÓ eles", () => {
  igual(RAIL_STANDALONE.map((i) => i.label), ["Atendimento", "Peticionamento"]);
});

teste("os dois itens de RAIL_STANDALONE abrem em aba nova — nenhuma navegação em-página", () => {
  for (const item of RAIL_STANDALONE) {
    igual(item.abrirEmNovaAba, true, `${item.label} não está marcado abrirEmNovaAba — voltaria a trocar o conteúdo desta mesma aba do Lúmen`);
  }
});

teste("nenhum item de RAIL_SECTIONS repete um href de RAIL_STANDALONE (e vice-versa) — cada rota pertence a um lugar só", () => {
  const doSecoes = RAIL_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
  const doStandalone = RAIL_STANDALONE.map((i) => i.href);
  for (const href of doStandalone) {
    igual(doSecoes.includes(href), false, `${href} aparece em RAIL_SECTIONS E em RAIL_STANDALONE`);
  }
});

// ── 5. O MAPA COMPLETO DO RAIL — trava contra qualquer regressão de ordem, item perdido ou
//       duplicado, nas 4 seções + os 2 portais, tudo de uma vez ─────────────────────────────────

const HREFS_ESPERADOS_POR_SECAO: Record<string, string[]> = {
  agenda: ["/agenda", "/kanban", "/alertas"],
  juridico: ["/publicacoes", "/processos", "/assessoria"],
  financeiro: ["/financeiro", "/financeiro/despesas", "/financeiro/receitas", "/financeiro/fluxo-de-caixa", "/financeiro/dre", "/financeiro/livro-caixa"],
  gestao: ["/configuracoes", "/conexoes", "/contatos", "/produtividade", "/relatorios"],
};

teste("o mapa completo do rail bate exatamente com o esperado — nenhuma rota sumiu, mudou de ordem ou foi duplicada por acidente", () => {
  for (const section of RAIL_SECTIONS) {
    igual(section.items.map((i) => i.href), HREFS_ESPERADOS_POR_SECAO[section.key], `seção '${section.key}' não bate com o mapa esperado`);
  }
  igual(RAIL_STANDALONE.map((i) => i.href), ["/atendimento-central", "/peticionamento"]);

  const todos = [...RAIL_SECTIONS.flatMap((s) => s.items.map((i) => i.href)), ...RAIL_STANDALONE.map((i) => i.href)];
  igual(new Set(todos).size, todos.length, "há uma rota repetida em mais de um item do rail inteiro (seções + portais)");
});

// ── 6. MUTAÇÃO PRINCIPAL — promover Atendimento a ícone do rail não pode ter alargado o acesso ───
//
// Este é o teste que a régua de acesso pede: Atendimento continua fechado por padrão
// (atendimentoOnly), exatamente como quando vivia dentro da extinta seção "Comunicação". Provado
// aqui de MESA (chamando itemVisivel) e, na próxima seção, por VARREDURA do componente que
// consome o dado — as duas provas juntas são o que pega tanto "o dado perdeu a flag" quanto "o
// componente esqueceu de filtrar".

teste("MUTAÇÃO PRINCIPAL: Atendimento continua INVISÍVEL para quem não tem atendimentoOnly, mesmo com tudo mais liberado", () => {
  const atendimento = RAIL_STANDALONE.find((i) => i.label === "Atendimento")!;
  igual(itemVisivel(atendimento, CTX({ podeAtendimento: false, veTodoAtendimento: true, hasFinanceAccess: true })), false,
    "Atendimento apareceu para quem não tem atendimentoOnly — virar ícone-portal alargou o acesso");
  verdade(itemVisivel(atendimento, CTX({ podeAtendimento: true })), "Atendimento sumiu para quem TEM atendimentoOnly — a régua ficou mais estreita do que era, o que também é regressão (só menos grave que alargar)");
});

teste("visibleStandaloneItems aplica a mesma régua — Peticionamento sempre passa, Atendimento só com atendimentoOnly", () => {
  igual(visibleStandaloneItems(CTX({ podeAtendimento: false })).map((i) => i.label), ["Peticionamento"]);
  igual(visibleStandaloneItems(CTX({ podeAtendimento: true })).map((i) => i.label), ["Atendimento", "Peticionamento"]);
});

// ── 7. O COMPONENTE — NavRail usa o filtro certo, e renderiza os dois portais como <a>, nunca <Link> ─

const NAV_RAIL_FONTE = readFileSync(join(RAIZ, "components", "NavRail.tsx"), "utf8");
const NAV_RAIL = codigoDe(NAV_RAIL_FONTE);

teste("NavRail chama visibleStandaloneItems (não usa RAIL_STANDALONE bruto) para decidir o que renderizar", () => {
  verdade(NAV_RAIL.includes("visibleStandaloneItems("), "components/NavRail.tsx não chama visibleStandaloneItems — sem filtro, os dois ícones apareceriam para todo mundo, inclusive quem não tem atendimentoOnly");
});

teste("TRAVA: nenhum <Link> do NavRail aponta, literalmente, para /atendimento-central ou /peticionamento", () => {
  // hrefsDeLinks devolve a EXPRESSÃO do href de cada <Link> — se algum dia alguém trocar o <a
  // target=\"_blank\"> dos ícones-portal por um <Link> (reintroduzindo a navegação em-página que
  // o dono não quer para eles), esta busca pega o href literal ou o item.href genérico that
  // aponta pra lá. Como os portais hoje são <a>, e não <Link>, a lista abaixo não deve conter
  // nada que mencione essas duas rotas.
  const hrefsDeLink = hrefsDeLinks(NAV_RAIL_FONTE);
  for (const href of hrefsDeLink) {
    verdade(!href.includes("atendimento-central"), `um <Link> do rail aponta para atendimento-central (${href}) — deveria ser <a target=\"_blank\">, não navegação em-página`);
    verdade(!href.includes("peticionamento"), `um <Link> do rail aponta para peticionamento (${href}) — deveria ser <a target=\"_blank\">, não navegação em-página`);
  }
});

teste("TRAVA: o rail renderiza os itens-portal como <a target=\"_blank\" rel=\"noopener\">, nunca <Link>", () => {
  verdade(/<a\s[^>]*href=\{item\.href\}/.test(NAV_RAIL), "não achei um <a href={item.href}> no rail — o componente StandaloneRailButton mudou de forma");
  const i = NAV_RAIL.indexOf("function StandaloneRailButton");
  verdade(i >= 0, "StandaloneRailButton sumiu do componente");
  const corpo = NAV_RAIL.slice(i, i + 1200);
  verdade(corpo.includes('target="_blank"'), "StandaloneRailButton não abre com target=\"_blank\"");
  verdade(corpo.includes('rel="noopener"'), "StandaloneRailButton não tem rel=\"noopener\" — a aba nova ganharia window.opener para o Lúmen");
  verdade(!corpo.includes("<Link"), "StandaloneRailButton usa <Link> — isso navegaria esta MESMA aba, contrariando \"abrem abas novas\"");
});

// ── 8. O ícone de Painel e o atalho fixo Ajustes saíram de verdade, não só de comentário ─────────

teste('TRAVA: não existe mais um RailButton fixo com label="Painel" (o logo já cobre essa navegação)', () => {
  verdade(!/label="Painel"/.test(NAV_RAIL), 'ainda existe um elemento com label="Painel" — o ícone duplicado do logo não foi removido');
  // O logo continua existindo e continua sendo o link para /painel — isso não é o ícone que saiu.
  verdade(/href="\/painel"/.test(NAV_RAIL), "o LINK DO LOGO para /painel sumiu — isso quebraria a única forma de voltar ao Painel pelo rail");
});

teste('TRAVA: não existe mais um atalho fixo com label="Ajustes" no rodapé do rail', () => {
  verdade(!/label="Ajustes"/.test(NAV_RAIL), 'ainda existe um elemento com label="Ajustes" — o atalho duplicado de Gestão não foi removido');
});

teste("o rail não importa mais os ícones que só serviam a Painel/Ajustes (LayoutDashboard, Settings) — código morto removido de verdade", () => {
  verdade(!/\bLayoutDashboard\b/.test(NAV_RAIL), "components/NavRail.tsx ainda referencia LayoutDashboard — ícone do Painel removido da UI mas não do import (código morto)");
  verdade(!/\bSettings\b/.test(NAV_RAIL), "components/NavRail.tsx ainda referencia Settings — ícone do Ajustes removido da UI mas não do import (código morto)");
});

// ── 9. A PALETA ⌘K (GlobalSearch) continua alcançando Atendimento e Peticionamento ───────────────
//
// Link interno que apontava para o lugar antigo tem de continuar funcionando: antes, os dois
// eram encontrados pelo loop `for (const section of RAIL_SECTIONS)`; com os dois fora de
// RAIL_SECTIONS, esse loop sozinho não os alcança mais — GlobalSearch precisa somar
// RAIL_STANDALONE à parte, ou a busca ⌘K silenciosamente perde os dois itens.

const GLOBAL_SEARCH = codigoDe(readFileSync(join(RAIZ, "components", "GlobalSearch.tsx"), "utf8"));

teste("TRAVA: GlobalSearch soma RAIL_STANDALONE (via visibleStandaloneItems) à lista de Navegação da paleta ⌘K", () => {
  verdade(GLOBAL_SEARCH.includes("visibleStandaloneItems"), "components/GlobalSearch.tsx não usa visibleStandaloneItems — Atendimento e Peticionamento sumiram da paleta ⌘K quando saíram de RAIL_SECTIONS");
});

// ── 10. O PWA (app/m) não foi tocado, e sua navegação própria continua flat, sem 'seção' nenhuma ─
//
// A tela "Mais" do celular (app/m/mais/page.tsx) já listava Atendimento/Contatos/Configurações
// como destinos INDEPENDENTES, sem nenhum conceito de "seção" (Jurídico/Gestão/Comunicação) —
// bem diferente do rail do computador. A reorganização desta entrega é uma mudança de AGRUPAMENTO
// no rail; onde não há agrupamento para reorganizar (o celular), não há nada a espelhar. Esta
// suíte só prova que ninguém "consertou" isso adicionando uma dependência nova por engano.

teste("app/m/mais/page.tsx continua sem importar lib/navSections — a reorganização do rail do computador não vazou para o celular", () => {
  const c = readFileSync(join(RAIZ, "app", "m", "mais", "page.tsx"), "utf8");
  igual(c.includes("navSections"), false, "app/m/mais/page.tsx passou a importar lib/navSections — o celular não deveria depender do agrupamento por seção do rail do computador");
});

resumo("Reorganização do rail — Publicações em Jurídico, Contatos em Gestão, ícones-portal (24/09/2026)");
