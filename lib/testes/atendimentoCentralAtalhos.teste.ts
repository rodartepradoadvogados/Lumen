import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { atalhoDaTecla, indiceVizinho, alvoEstaDigitando } from "@/lib/atalhosDaCentral";

// ============================================================================
// OS ATALHOS E O ACABAMENTO (A5 do plano do Atendimento, 29/09/2026) — critérios 8 e 10.
// O comportamento no navegador (`/`, ↑↓, F, Esc em cada largura) foi medido em Chromium e está no PR.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const ATALHOS = codigoDe(le("components", "atendimento", "AtalhosDaCentral.tsx"));
const SELETOR = codigoDe(le("components", "atendimento", "SeletorDeFase.tsx"));
const CSS = le("app", "atendimento-central", "atendimento-central.css");
const PAGE = codigoDe(le("app", "atendimento-central", "page.tsx"));

teste("as teclas: / busca, F fase, ↓ próxima, ↑ anterior; o resto não é atalho", () => {
  igual(atalhoDaTecla("/"), "buscar");
  igual(atalhoDaTecla("f"), "fase");
  igual(atalhoDaTecla("F"), "fase");
  igual(atalhoDaTecla("ArrowDown"), "proxima");
  igual(atalhoDaTecla("ArrowUp"), "anterior");
  for (const t of ["a", "Enter", "Escape", "ArrowLeft", " ", "1"]) igual(atalhoDaTecla(t), null, `${t}: `);
});

teste("↑/↓: sem selecionada ↓ vai à primeira e ↑ à última; nas pontas não dá a volta", () => {
  igual(indiceVizinho(-1, 5, "proxima"), 0);
  igual(indiceVizinho(-1, 5, "anterior"), 4);
  igual(indiceVizinho(2, 5, "proxima"), 3);
  igual(indiceVizinho(2, 5, "anterior"), 1);
  igual(indiceVizinho(4, 5, "proxima"), 4, "no fim, ↓ fica: ");
  igual(indiceVizinho(0, 5, "anterior"), 0, "no começo, ↑ fica: ");
  igual(indiceVizinho(-1, 0, "proxima"), -1, "lista vazia: ");
});

teste("NENHUM atalho age enquanto a pessoa escreve (input, textarea, select, contenteditable)", () => {
  verdade(alvoEstaDigitando({ tagName: "INPUT" }), "input");
  verdade(alvoEstaDigitando({ tagName: "TEXTAREA" }), "textarea");
  verdade(alvoEstaDigitando({ tagName: "SELECT" }), "select");
  verdade(alvoEstaDigitando({ tagName: "DIV", isContentEditable: true }), "contenteditable");
  verdade(!alvoEstaDigitando({ tagName: "BODY", isContentEditable: false }), "body não é campo");
  verdade(!alvoEstaDigitando({ tagName: "A" }), "link não é campo");
  verdade(!alvoEstaDigitando(null), "null");
  // No componente: o teste de "digitando" vem ANTES de interpretar a tecla (só o Esc tem tratamento próprio).
  const iDigitando = ATALHOS.indexOf("if (alvoEstaDigitando(e.target as HTMLElement)) return;");
  const iAtalho = ATALHOS.indexOf("atalhoDaTecla(e.key)");
  verdade(iDigitando > 0 && iAtalho > iDigitando, "os atalhos são interpretados antes de checar se a pessoa está escrevendo");
});

teste("teclas com Ctrl/Cmd/Alt e o modal de 'Iniciar conversa' aberto ficam de fora", () => {
  verdade(/e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey/.test(ATALHOS), "Ctrl/Cmd/Alt não são poupados — Ctrl+F do navegador abriria o menu de fase");
  verdade(/hayModalAberto\(\)\) return/.test(ATALHOS) && /\.fixed\.inset-0/.test(ATALHOS), "com o modal aberto os atalhos agem por baixo dele");
});

teste("Esc: o menu de fase se fecha sozinho e NÃO deixa o Esc chegar à Central; depois vêm a gaveta e o celular", () => {
  verdade(/e\.stopPropagation\(\)/.test(SELETOR) && /fechar\(true\)/.test(SELETOR), "o Esc do menu de fase vaza para a Central (fecharia também a gaveta / voltaria à lista)");
  const iGaveta = ATALHOS.indexOf("gavetaEstaAberta()");
  const iCelular = ATALHOS.indexOf("if (noCelular()");
  verdade(iGaveta > 0 && iCelular > iGaveta, "a ordem do Esc é: gaveta primeiro, depois voltar à lista no celular");
  verdade(/dataset\.vista === "conversa"/.test(ATALHOS), "o Esc volta à lista mesmo quando a lista já está à vista");
});

teste("a seta leva a linha à vista pelo scrollTop da LISTA — nunca scrollIntoView (rola a página)", () => {
  verdade(!/scrollIntoView/.test(ATALHOS), "scrollIntoView rola todos os ancestrais");
  verdade(/caixa\.scrollTop/.test(ATALHOS), "a lista não é rolada pela própria caixa");
  verdade(/router\.push\(alvo\.getAttribute\("href"\)/.test(ATALHOS), "a seta não usa o href da linha (que leva o recorte)");
});

teste("a página monta os atalhos, e as dicas somem em janela baixa e estreita", () => {
  verdade(/<AtalhosDaCentral \/>/.test(PAGE), "AtalhosDaCentral não está na página");
  verdade(/id="busca-atendimentos"/.test(PAGE), "o campo de busca perdeu o id que o atalho / procura");
  verdade(/\.atd-dica\s*\{\s*display:\s*none/.test(CSS.replace(/\s+/g, " ")), "sem a regra que esconde as dicas");
  verdade((CSS.match(/\.atd-dica/g) ?? []).length >= 2, "as dicas só somem em um dos casos (altura ou largura)");
});

teste("CRITÉRIO 10: nenhum token de COR novo — as regras da grade não têm hex e os tokens novos são só de medida", () => {
  const grade = CSS.slice(CSS.indexOf("A GRADE DA CENTRAL"));
  verdade(grade.length > 500, "não achei o bloco da grade");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(grade.replace(/\/\*[\s\S]*?\*\//g, "")), "a grade tem hex cru");
  const novos = ["--atd-largura-lista", "--atd-largura-lista-estreita", "--atd-largura-trilho"];
  for (const t of novos) verdade(new RegExp(`${t}:\\s*\\d+px;`).test(CSS), `${t} não é uma medida`);
  verdade(!/--atd-[a-z-]*(cor|color|bg|tx)[a-z-]*:/.test(grade), "a grade declarou token de cor");
});

teste("CRITÉRIO 10: sombra só onde algo flutua (gaveta, menu de fase, botão de novas mensagens) — nenhuma na lista, no cartão nem no painel de recusa", () => {
  igual((PAGE.match(/shadow/g) ?? []).length, 0, "a página tem sombra: ");
  const flutuantes = ["SeletorDeFase.tsx", "RolarParaOFim.tsx"];
  for (const f of flutuantes) verdade(/atd-shadow-card/.test(le("components", "atendimento", f)), `${f}: o flutuante perdeu a sombra`);
  verdade(!/shadow|atd-shadow-card/.test(codigoDe(le("components", "atendimento", "ListaDeConversas.tsx"))), "a lista ganhou sombra");
  const gaveta = /\.atd-trilho\s*\{[^}]*box-shadow/.exec(CSS.slice(CSS.indexOf("@media (max-width: 1239px)")));
  verdade(!!gaveta, "a gaveta (trilho flutuante) não tem sombra");
  const fora = CSS.slice(0, CSS.indexOf("@media (max-width: 1239px)"));
  verdade(!/\.atd-(lista|conversa|trilho|corpo)\s*\{[^}]*box-shadow/.test(fora), "a sombra do trilho vale também quando ele é coluna");
});

teste("R5: SeletorDeFase, AtalhosDaCentral e BotaoDaGaveta só importam constantes de módulos neutros", () => {
  for (const arq of ["SeletorDeFase.tsx", "AtalhosDaCentral.tsx", "BotaoDaGaveta.tsx", "AtualizarAoVivo.tsx", "RolarParaOFim.tsx"]) {
    const fonte = le("components", "atendimento", arq);
    for (const imp of fonte.matchAll(/from "(@\/[^"]+)"/g)) {
      const alvo = imp[1].replace("@/", "");
      verdade(!alvo.startsWith("components/"), `${arq} importa componente ${alvo}`);
      if (alvo.startsWith("lib/")) verdade(!/^"use client"/.test(le(`${alvo}.ts`)), `${arq}: ${alvo} é "use client"`);
    }
  }
});

teste("o corpo da página não ganhou findMany sem teto (a lista continua sem varrer a tabela)", () => {
  const corpo = corpoDaFuncao(le("app", "atendimento-central", "page.tsx"), "AtendimentoCentralPage");
  const semTeto = [...corpo.matchAll(/findMany\(\{[\s\S]{0,400}?\}\)/g)].map((m) => m[0]).filter((t) => !/take:/.test(t));
  igual(semTeto.length, 0);
});

resumo("Central de Atendimento — atalhos e acabamento (A5)");
