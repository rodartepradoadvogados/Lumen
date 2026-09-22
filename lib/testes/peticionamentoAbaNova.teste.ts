import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// PRIORIDADE 0 (entrega "peticionamento lê documentos") — a aba de Peticionamento é uma ABA NOVA
// do navegador, pedido explícito do dono: abrir o peticionamento não pode tirar o Lúmen da
// frente, e fechar/usar a aba do peticionamento não pode interferir em nada no uso do site.
//
// A régua de verdade é código, não layout: `router.push`/`openTab` (components/TabsProvider.tsx)
// trocam o conteúdo da MESMA aba/processo do navegador — parecem "abrir uma aba" na casca do
// Lúmen (guias internas), mas por baixo é só React trocando de tela. Só `<a target="_blank"
// rel="noopener">` (ou `window.open(..., "noopener")`) abre um processo de verdade, novo, sem
// referência de volta. SEM o "noopener", a aba nova ganha `window.opener` para a aba que a abriu
// — exatamente a interferência que o dono não quer (a aba nova poderia navegar/fechar a do Lúmen
// por trás, via `window.opener.location`).
//
// Esta varredura DERIVA a exigência do próprio dado (lib/navSections.ts:abrirEmNovaAba) e
// verifica que cada consumidor conhecido (PageSectionTabs, GlobalSearch) trata esse item como
// aba nova de verdade — nunca como os demais itens de navegação.

const RAIZ = process.cwd();
const NAV_SECTIONS = codigoDe(readFileSync(join(RAIZ, "lib", "navSections.ts"), "utf8"));
const PAGE_SECTION_TABS = codigoDe(readFileSync(join(RAIZ, "components", "PageSectionTabs.tsx"), "utf8"));
const GLOBAL_SEARCH_FONTE = readFileSync(join(RAIZ, "components", "GlobalSearch.tsx"), "utf8");
const GLOBAL_SEARCH = codigoDe(GLOBAL_SEARCH_FONTE);
const SAIDA_CONTEXT = readFileSync(join(RAIZ, "components", "peticionamento", "SaidaContext.tsx"), "utf8");
const APP_SHELL = codigoDe(readFileSync(join(RAIZ, "components", "AppShell.tsx"), "utf8"));

teste("o item de Peticionamento em lib/navSections.ts está marcado para abrir em aba nova", () => {
  const trecho = NAV_SECTIONS.match(/\{\s*href:\s*"\/peticionamento"[^}]*\}/);
  verdade(!!trecho, 'não achei o item { href: "/peticionamento", ... } em lib/navSections.ts — a varredura está cega');
  verdade(trecho![0].includes("abrirEmNovaAba: true"), "o item de Peticionamento perdeu abrirEmNovaAba: true — voltaria a trocar de tela dentro da mesma aba do Lúmen");
});

teste('TRAVA: PageSectionTabs renderiza o item abrirEmNovaAba como <a target="_blank" rel="noopener">, nunca via <Link>/router.push', () => {
  verdade(PAGE_SECTION_TABS.includes("item.abrirEmNovaAba"), "PageSectionTabs deixou de checar item.abrirEmNovaAba — o item de Peticionamento cairia no mecanismo comum de clique único/duplo clique, que é a MESMA aba");
  const idx = PAGE_SECTION_TABS.indexOf("item.abrirEmNovaAba");
  const janela = PAGE_SECTION_TABS.slice(idx, idx + 400);
  verdade(janela.includes('target="_blank"'), 'o ramo de abrirEmNovaAba não abre com target="_blank"');
  verdade(janela.includes('rel="noopener"'), 'falta rel="noopener" no ramo de abrirEmNovaAba — sem ele a aba nova mantém referência (window.opener) à aba que a abriu');
});

teste("TRAVA: GlobalSearch (paleta ⌘K) abre o item abrirEmNovaAba em aba nova tanto no clique (âncora) quanto no Enter (window.open)", () => {
  verdade(GLOBAL_SEARCH.includes("item.abrirEmNovaAba"), "a lista de resultados da paleta deixou de tratar abrirEmNovaAba");
  // Mais de UMA ocorrência de "item.abrirEmNovaAba" no arquivo (construção da lista, render,
  // activate()) — pega TODAS e exige que ALGUMA delas seja o ramo de render com a âncora de
  // verdade, em vez de assumir que a primeira é a certa (a primeira é só a construção do dado).
  const janelas = [...GLOBAL_SEARCH.matchAll(/item\.abrirEmNovaAba/g)].map((m) => GLOBAL_SEARCH.slice(m.index!, m.index! + 600));
  verdade(janelas.some((j) => j.includes('target="_blank"') && j.includes('rel="noopener"')),
    'nenhuma ocorrência de item.abrirEmNovaAba está perto de um target="_blank" + rel="noopener" — o clique do item na paleta não abre em aba nova de verdade');

  const corpoActivate = corpoDaFuncao(GLOBAL_SEARCH_FONTE, "activate");
  verdade(corpoActivate.length > 60, 'corpoDaFuncao("activate") devolveu corpo curto demais — varredura cega');
  const c = codigoDe(corpoActivate);
  verdade(c.includes("item.abrirEmNovaAba"), "activate() (caminho do Enter no teclado) não checa abrirEmNovaAba — Enter continuaria navegando na mesma aba");
  verdade(/window\.open\([^)]*noopener/.test(c), 'activate() não abre com "noopener" explícito quando ativado pelo teclado');
});

teste("HARD GATE: o Provedor de saída do Peticionamento (beforeunload/popstate) nunca é montado no AppShell do resto do Lúmen", () => {
  verdade(!APP_SHELL.includes("ProvedorDeSaida") && !APP_SHELL.includes("SaidaContext"),
    "o AppShell do Lúmen passou a importar o Provedor de saída do Peticionamento — o pop-up de saída (e o beforeunload) vazaria para a aba principal do site");
});

teste("SaidaContext: beforeunload e popstate ficam DENTRO do ProvedorDeSaida — nunca soltos no topo do módulo", () => {
  const c = codigoDe(SAIDA_CONTEXT);
  verdade(/addEventListener\("beforeunload"/.test(c), "faltou o listener de beforeunload");
  verdade(/addEventListener\("popstate"/.test(c), "faltou o listener de popstate");
  const idxProvider = c.indexOf("export function ProvedorDeSaida");
  verdade(idxProvider >= 0, "ProvedorDeSaida sumiu do módulo — varredura cega");
  verdade(c.indexOf('addEventListener("beforeunload"') > idxProvider,
    "o listener de beforeunload saiu de dentro do ProvedorDeSaida — rodaria assim que QUALQUER página importasse o arquivo, aba do Lúmen incluída");
  verdade(c.indexOf('addEventListener("popstate"') > idxProvider,
    "o listener de popstate saiu de dentro do ProvedorDeSaida");
});

resumo("Peticionamento — aba nova do navegador (prioridade 0)");
