import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { hrefEtapaAnterior, type EtapaPeticionamento } from "../peticionamentoNavegacao";
import { CATEGORIAS_DE_PECA, ehCategoriaConhecida, rotuloCategoriaPeca } from "../peticionamentoCategoriaPeca";
import { PETICIONAMENTO_THEME_KEY, PETICIONAMENTO_THEME_INIT_SCRIPT } from "../peticionamentoTheme";
import { PORTAL_THEME_KEY } from "../portalTheme";
import { THEME_KEY } from "../theme";

// ============================================================================
// PEDIDOS DO DONO, 24/09/2026 (itens 1, 2 e 3 da lista dele) — "Nova petição, contrato, parecer,
// notificação (tire o extrajudicial do nome), Geral: […] avança sozinho […] com animação"; "botão
// de voltar em todas as páginas do peticionamento"; "o botão de modo claro e escuro sumiu do
// peticionamento".
//
// As três âncoras usadas aqui são pegas de dentro do CORPO das funções examinadas
// (corpoDaFuncao), nunca `arquivo.includes(...)` solto — a armadilha registrada em
// lib/testes/executar.ts (o comentário no topo do arquivo que cita a mesma frase que a varredura
// procura, ou a busca que transborda para a função vizinha) já custou tempo real desta casa.
// ============================================================================

const RAIZ = process.cwd();
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

// ── item 2: o botão "Voltar" ────────────────────────────────────────────────────────────────────

teste("hrefEtapaAnterior devolve a rota de CADA etapa anterior da sessão, nesta ordem: tipo ← entrada, contexto ← tipo, wizard ← contexto, documentos ← wizard, confirmar ← documentos, minuta ← confirmar", () => {
  const id = "sessao-123";
  igual(hrefEtapaAnterior("tipo", id), "/peticionamento");
  igual(hrefEtapaAnterior("contexto", id), `/peticionamento/${id}/tipo`);
  igual(hrefEtapaAnterior("wizard", id), `/peticionamento/${id}/contexto`);
  igual(hrefEtapaAnterior("documentos", id), `/peticionamento/${id}/wizard`);
  igual(hrefEtapaAnterior("confirmar", id), `/peticionamento/${id}/documentos`);
  igual(hrefEtapaAnterior("minuta", id), `/peticionamento/${id}/confirmar`);
});

teste("as seis etapas de EtapaPeticionamento têm todas uma etapa anterior definida (nenhuma cai no `undefined` do switch)", () => {
  const etapas: EtapaPeticionamento[] = ["tipo", "contexto", "wizard", "documentos", "confirmar", "minuta"];
  for (const e of etapas) {
    const href = hrefEtapaAnterior(e, "x");
    verdade(typeof href === "string" && href.startsWith("/peticionamento"), `hrefEtapaAnterior("${e}", …) deveria devolver uma rota de peticionamento, obtive ${JSON.stringify(href)}`);
  }
});

teste("o CORPO de ShellPeticionamento (não um comentário do arquivo) usa hrefEtapaAnterior para montar o link de Voltar", () => {
  const fonte = ler("components/peticionamento/Shell.tsx");
  const corpo = corpoDaFuncao(fonte, "ShellPeticionamento");
  verdade(corpo.length > 0, "ShellPeticionamento não foi encontrado — varredura cega");
  verdade(corpo.includes("hrefEtapaAnterior(ativo, sessaoId)"), "o topbar de ShellPeticionamento deveria montar o href do botão Voltar com hrefEtapaAnterior(ativo, sessaoId)");
  verdade(/>\s*Voltar\s*</.test(corpo) || corpo.includes(">Voltar<"), "não encontrei o texto visível \"Voltar\" dentro do corpo de ShellPeticionamento");
});

teste("app/peticionamento/[id]/excedido/page.tsx passa ativo=\"confirmar\" para o Shell (é de lá que ExcedidoClient sempre é alcançado — não \"documentos\")", () => {
  const fonte = ler("app/peticionamento/[id]/excedido/page.tsx");
  const corpo = corpoDaFuncao(fonte, "ExcedidoPage");
  verdade(corpo.length > 0, "ExcedidoPage não foi encontrado — varredura cega");
  verdade(corpo.includes('ativo="confirmar"'), 'excedido/page.tsx deveria passar ativo="confirmar" ao ShellPeticionamento');
});

teste("RascunhosClient tem um botão \"Voltar\" que usa router.back() — não tem uma etapa anterior fixa (chega-se pelo Menu de qualquer tela)", () => {
  const fonte = ler("components/peticionamento/RascunhosClient.tsx");
  const corpo = corpoDaFuncao(fonte, "RascunhosClient");
  verdade(corpo.length > 0, "RascunhosClient não foi encontrado — varredura cega");
  verdade(corpo.includes("router.back()"), "RascunhosClient deveria voltar com router.back()");
});

// ── item 3: o alternador de tema ────────────────────────────────────────────────────────────────

teste("o Peticionamento tem chave de tema PRÓPRIA, diferente da do site e da do portal (nenhuma aba deveria vazar tema para a outra)", () => {
  // Comparados como `string` solta: as três chaves são literais distintos, e TypeScript recusa
  // (corretamente) comparar dois literais que já sabe de antemão que nunca são iguais — o que é
  // exatamente o que este teste quer PROVAR, então a comparação larga é proposital aqui.
  const chaves: string[] = [PETICIONAMENTO_THEME_KEY, PORTAL_THEME_KEY, THEME_KEY];
  igual(new Set(chaves).size, 3, "as três chaves de tema (peticionamento/portal/site) deveriam ser todas distintas");
  igual(PETICIONAMENTO_THEME_KEY, "rp-peticionamento-theme");
});

teste("AlternadorDeTema.tsx não importa lib/theme nem lib/portalTheme — mecanismo isolado, de propósito (paleta própria, 'Ardósia fria')", () => {
  const semComentarios = codigoDe(ler("components/peticionamento/AlternadorDeTema.tsx"));
  verdade(!semComentarios.includes('from "@/lib/theme"') && !semComentarios.includes('from "@/lib/portalTheme"'), "AlternadorDeTema.tsx deveria usar só lib/peticionamentoTheme.ts, não os mecanismos de tema do site/portal");
  verdade(semComentarios.includes('from "@/lib/peticionamentoTheme"'), "AlternadorDeTema.tsx deveria importar de lib/peticionamentoTheme.ts");
});

teste("o script anti-flash do Peticionamento marca data-theme (atributo), nunca uma classe — é o mecanismo que peticionamento.css já espera (.peticionamento[data-theme=\"light\"])", () => {
  verdade(PETICIONAMENTO_THEME_INIT_SCRIPT.includes('setAttribute("data-theme", "light")'), "o script deveria marcar o atributo data-theme, para casar com a regra .peticionamento[data-theme=\"light\"] já existente em peticionamento.css");
  verdade(PETICIONAMENTO_THEME_INIT_SCRIPT.includes("peticionamento-shell"), "o script deveria mirar o nó #peticionamento-shell");
});

teste("app/peticionamento/layout.tsx dá id=\"peticionamento-shell\" à raiz da aba (só na árvore COM acesso) e injeta o script anti-flash", () => {
  // corpoDaFuncao não cobre `export default async function` (fora do padrão que a função
  // reconhece) — o arquivo é curto e de um propósito só, então varremos ele inteiro sem
  // comentário (codigoDe), e não uma janela de N caracteres.
  const semComentarios = codigoDe(ler("app/peticionamento/layout.tsx"));
  verdade(semComentarios.includes('id="peticionamento-shell"'), 'a raiz de app/peticionamento/layout.tsx deveria ter id="peticionamento-shell"');
  // Só UMA vez: a árvore de "Sem acesso" (podeAcessarAba === false) não precisa do id — não tem
  // Shell, não tem AlternadorDeTema, não tem nada que leia #peticionamento-shell.
  igual((semComentarios.match(/id="peticionamento-shell"/g) ?? []).length, 1);
  verdade(semComentarios.includes("PETICIONAMENTO_THEME_INIT_SCRIPT"), "layout.tsx deveria injetar PETICIONAMENTO_THEME_INIT_SCRIPT");
});

teste("ShellPeticionamento renderiza o AlternadorDeTema (não o ThemeToggle do site nem o PortalThemeToggle do portal)", () => {
  const fonte = ler("components/peticionamento/Shell.tsx");
  const corpo = corpoDaFuncao(fonte, "ShellPeticionamento");
  verdade(corpo.includes("<AlternadorDeTema"), "ShellPeticionamento deveria renderizar <AlternadorDeTema />");
  verdade(!corpo.includes("PortalThemeToggle") && !corpo.includes("<ThemeToggle"), "ShellPeticionamento não deveria usar o alternador do portal/site — esta aba tem o seu próprio");
});

teste("a transição .passo-saindo/.passo-entrando só anima transform e opacity (nunca width/left, que disparam layout) e é desligada por prefers-reduced-motion", () => {
  const css = ler("app/peticionamento/peticionamento.css");
  const bloco = css.slice(css.indexOf("@keyframes peticionamento-sai-esquerda"), css.indexOf("@keyframes peticionamento-entra-direita") + 400);
  verdade(bloco.includes("transform:"), "a animação de saída deveria mexer em transform");
  verdade(!/\bwidth\s*:/.test(bloco) && !/\bleft\s*:/.test(bloco), "a transição não deveria animar width/left (dispara layout) — só transform/opacity");
  verdade(css.includes("@media (prefers-reduced-motion: reduce)") && /prefers-reduced-motion: reduce\) \{[^}]*\.passo-saindo/.test(css.replace(/\n/g, " ")), "a transição deveria estar desligada sob prefers-reduced-motion");
});

// ── item 1: escolher já avança + o rótulo "Notificação" ────────────────────────────────────────

teste('rotuloCategoriaPeca troca só "Notificação Extrajudicial" por "Notificação" — as outras quatro categorias não mudam', () => {
  igual(rotuloCategoriaPeca("Notificação Extrajudicial"), "Notificação");
  for (const c of CATEGORIAS_DE_PECA) {
    if (c === "Notificação Extrajudicial") continue;
    igual(rotuloCategoriaPeca(c), c);
  }
});

teste("PROVA DE SEGURANÇA DE DADOS: o VALOR canônico continua \"Notificação Extrajudicial\" — uma sessão já criada com essa categoria continua reconhecida (ehCategoriaConhecida), o rótulo é só de tela", () => {
  igual(CATEGORIAS_DE_PECA, ["Petição", "Contrato", "Parecer", "Notificação Extrajudicial", "Geral"]);
  verdade(ehCategoriaConhecida("Notificação Extrajudicial"), 'uma sessão antiga com categoriaPeca="Notificação Extrajudicial" precisa continuar "conhecida" — trocar o VALOR (em vez do rótulo) quebraria isto em silêncio');
  verdade(!ehCategoriaConhecida("Notificação"), '"Notificação" sozinha não é (e não deveria virar) um valor válido de categoriaPeca — é só o texto que a tela mostra');
});

teste("o CORPO de TipoPecaClient não tem mais um botão \"Continuar\" separado — escolher já navega", () => {
  const fonte = ler("components/peticionamento/TipoPecaClient.tsx");
  const corpo = corpoDaFuncao(fonte, "TipoPecaClient");
  verdade(corpo.length > 0, "TipoPecaClient não foi encontrado — varredura cega");
  verdade(!/>\s*Continuar\s*</.test(corpo), 'o corpo de TipoPecaClient ainda tem um botão de texto "Continuar" — escolher deveria avançar sozinho');
  verdade(corpo.includes("setSaindo(true)"), "escolher uma categoria deveria disparar a animação de saída (setSaindo(true)) após salvar com sucesso");
  verdade(corpo.includes("router.push(`/peticionamento/${sessaoId}/contexto?entrando=1`)"), "TipoPecaClient deveria navegar para /contexto com o sinal ?entrando=1 (para a animação de entrada de ContextoClient.tsx)");
});

teste("escolher() só navega DEPOIS de definirCategoriaPeca ter sucesso — um erro do servidor não pode levar a tela embora", () => {
  const fonte = ler("components/peticionamento/TipoPecaClient.tsx");
  const corpo = corpoDaFuncao(fonte, "escolher");
  verdade(corpo.length > 0, "a função escolher não foi encontrada — varredura cega");
  const iErro = corpo.indexOf('"error" in resultado');
  const iSaindo = corpo.indexOf("setSaindo(true)");
  verdade(iErro >= 0 && iSaindo >= 0 && iErro < iSaindo, "escolher() deveria checar o erro do servidor ANTES de marcar setSaindo(true)");
});

teste("os botões de categoria mostram o RÓTULO (rotuloCategoriaPeca), não o valor cru — é o que tira \"Extrajudicial\" da tela", () => {
  const fonte = ler("components/peticionamento/TipoPecaClient.tsx");
  const corpo = corpoDaFuncao(fonte, "TipoPecaClient");
  verdade(corpo.includes("rotuloCategoriaPeca(c)"), "o botão de cada categoria deveria mostrar rotuloCategoriaPeca(c), não {c} cru");
});

teste("o CORPO de ContextoClient lê ?entrando=1 de window.location (não useSearchParams, que pediria Suspense na page.tsx) e limpa a URL com history.replaceState", () => {
  const fonte = ler("components/peticionamento/ContextoClient.tsx");
  const corpo = corpoDaFuncao(fonte, "ContextoClient");
  verdade(corpo.length > 0, "ContextoClient não foi encontrado — varredura cega");
  verdade(corpo.includes('window.location.search).get("entrando")'), "ContextoClient deveria ler ?entrando=1 de window.location.search");
  verdade(corpo.includes("window.history.replaceState"), "ContextoClient deveria limpar o parâmetro da URL com window.history.replaceState, para não reaparecer num F5 ou num \"voltar\" do navegador");
  verdade(corpo.includes("passo-entrando"), "a raiz de ContextoClient (ctx-page) deveria ganhar a classe passo-entrando quando entrando=1");
});

resumo("Peticionamento — navegação, tema e transição (pedido do dono, 24/09/2026)");
