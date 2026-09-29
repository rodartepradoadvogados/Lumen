import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { hrefDaLista } from "@/lib/conversaDaCentral";

// ============================================================================
// A GRADE DA CENTRAL (A1 do plano do Atendimento, 29/09/2026) — o cabeçalho que nunca sai da tela e
// o chat que abre no fim.
//
// O QUE ESTA SUÍTE PROVA E O QUE NÃO: ela varre o código-fonte (ver a nota no topo de executar.ts).
// A prova de que o documento não rola e de que a conversa abre no fim está nas MEDIDAS feitas no
// navegador (scrollTop/scrollHeight, getBoundingClientRect) descritas no PR — o que fica aqui é a
// trava que impede o defeito de voltar sem ninguém ver.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const PAGE = le("app", "atendimento-central", "page.tsx");
const CORPO = corpoDaFuncao(PAGE, "AtendimentoCentralPage");
const CSS = le("app", "atendimento-central", "atendimento-central.css");
const TRILHO = codigoDe(le("components", "atendimento", "TrilhoDoAtendimento.tsx"));

teste("a caixa que ROLA a conversa tem data-rolagem-da-conversa — sem ele RolarParaOFim não acha a caixa e o chat abre no COMEÇO", () => {
  // O ATRIBUTO, com o `=`: o nome também aparece num comentário do JSX (que `codigoDe` não tira), e
  // uma busca só pelo nome passava mesmo com o atributo apagado (mutação pega em 29/09/2026).
  const i = CORPO.indexOf('data-rolagem-da-conversa=""');
  verdade(i > 0, "a caixa de rolagem da conversa da Central perdeu o atributo que RolarParaOFim procura");
  const abertura = CORPO.slice(CORPO.lastIndexOf("<div", i), CORPO.indexOf(">", i));
  verdade(/overflow-y-auto/.test(abertura), "o atributo não está na caixa que rola (overflow-y-auto)");
  const depois = CORPO.slice(i, i + 900);
  verdade(/<Conversa\b/.test(depois), "o atributo não envolve a <Conversa>");
});

teste("a <Conversa> tem key = o lead — trocar de conversa pela lista remonta e o efeito de 'ir ao fim' roda de novo", () => {
  const tag = /<Conversa\b[\s\S]*?\/>/.exec(CORPO)?.[0] ?? "";
  verdade(/key=\{selecionado\.id\}/.test(tag), "a <Conversa> da Central não tem key={selecionado.id}");
});

teste("o painel de recusa mora DENTRO do trilho (região que rola), e não como irmão dele na coluna", () => {
  const abre = CORPO.indexOf("<TrilhoDoAtendimento");
  const fecha = CORPO.indexOf("</TrilhoDoAtendimento>");
  verdade(abre > 0 && fecha > abre, "o trilho deixou de ter filhos — o painel de recusa voltou a ser irmão dele");
  const dentro = CORPO.slice(abre, fecha);
  verdade(dentro.includes("<RecusarLeadPainel"), "RecusarLeadPainel não está dentro do trilho");
  verdade(dentro.includes("id={ANCORA_DA_RECUSA}"), "a âncora do 'Ver a recusa' não está dentro do trilho");
});

teste("TrilhoDoAtendimento renderiza os filhos DENTRO do miolo que rola, e o rodapé fica fora dele", () => {
  const miolo = TRILHO.indexOf("overflow-y-auto");
  const filhos = TRILHO.indexOf("{children}");
  const rodape = TRILHO.lastIndexOf("Transformar em processo");
  verdade(miolo > 0 && filhos > miolo, "{children} não está depois da abertura do miolo que rola");
  verdade(rodape > filhos, "o rodapé 'Transformar em processo' não vem depois dos filhos");
  const rodapeDiv = TRILHO.lastIndexOf("<div", rodape);
  verdade(/shrink-0/.test(TRILHO.slice(rodapeDiv, rodape)), "o rodapé do trilho deixou de ser shrink-0 — sairia da tela com o painel de recusa aberto");
});

teste("nenhuma coluna da Central tem largura fixa no JSX (`w-[NNNpx]`) — a medida mora nos tokens --atd-largura-*", () => {
  verdade(!/\bw-\[(340|380|320)px\]/.test(codigoDe(PAGE)), "a largura de uma coluna voltou a ser escrita no JSX");
  for (const t of ["--atd-largura-lista", "--atd-largura-lista-estreita", "--atd-largura-trilho"]) {
    verdade(new RegExp(`${t}:\\s*\\d+px;`).test(CSS), `${t} sumiu do CSS`);
  }
});

teste("a grade responde: 2 colunas até 1239px (trilho vira gaveta) e 1 coluna até 760px", () => {
  verdade(/@media \(max-width:\s*1239px\)/.test(CSS), "sem o ponto de quebra das duas colunas (1239px)");
  verdade(/@media \(max-width:\s*760px\)/.test(CSS), "sem o ponto de quebra de uma coluna (760px)");
  verdade(/\.atd-corpo\[data-trilho="aberto"\]\s*\.atd-trilho\s*\{[^}]*display:\s*flex/.test(CSS), "a gaveta aberta não aparece");
  verdade(/data-vista="lista"\]\s*\.atd-conversa/.test(CSS), "no celular a conversa não some quando a vista é a lista");
  verdade(/max-height:\s*640px/.test(CSS), "sem o ajuste para janela BAIXA (o PWA tem 612px de altura)");
});

teste("no celular, `data-vista` vem do servidor: conversa só quando o id foi PEDIDO na URL", () => {
  verdade(/data-vista=\{idPedido \? "conversa" : "lista"\}/.test(CORPO), "data-vista deixou de depender do id pedido — o celular abriria uma conversa que ninguém pediu");
});

teste("hrefDaLista escreve o recorte inteiro, escapado, e só o que existe", () => {
  igual(hrefDaLista(), "/atendimento-central?aba=atendimentos");
  igual(hrefDaLista({ fase: "QUALIFICACAO", q: " ana ", arquivados: true, id: "a b" }), "/atendimento-central?aba=atendimentos&fase=QUALIFICACAO&q=ana&arq=1&id=a%20b");
  igual(hrefDaLista({ q: "a&b=c" }), "/atendimento-central?aba=atendimentos&q=a%26b%3Dc");
});

resumo("Central de Atendimento — grade e rolagem (A1)");
