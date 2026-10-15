import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { itensDaBarra } from "@/lib/navegacaoDoAtendimentoApp";
import TrilhoDaCentral from "@/components/atendimento/TrilhoDaCentral";
import Conversa from "@/components/atendimento/Conversa";
import MarcaDeEntregaViva from "@/components/atendimento/MarcaDeEntregaViva";

// ============================================================================
// O ATENDIMENTO NAS TRÊS SUPERFÍCIES (15/10/2026, DESIGN.md §9.1) — app, Central do site e /m.
// O que esta etapa promete, travado em teste:
//   1. o trilho da Central tem os MESMOS alvos do app, na mesma ordem, e respeita o nível de acesso;
//   2. a fila viva: as duas listas (Central e app) entregam o contrato do FLIP (id, marca, espera);
//   3. o envio otimista não mente: se o servidor recusa, o balão some e o texto volta para a caixa;
//   4. a conversa no acabamento "app" mostra os tiques de entrega; a do portal antigo não muda;
//   5. todo movimento novo tem alternativa para quem pediu movimento reduzido;
//   6. o tema de cada superfície: Central segue o site, /m segue o PWA.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const GLOBAL = le("app", "globals.css");

const trilho = (veTodo: boolean, ativo: "conversas" | "funil" | "triagem" = "conversas", esperando = 3) =>
  renderToStaticMarkup(
    <TrilhoDaCentral ativo={ativo} veTodo={veTodo} esperando={esperando} hrefConversas="/c" hrefFunil="/f" hrefTriagem="/t" />,
  );

teste("TRILHO: os alvos são os do app, na mesma ordem (Conversas, Funil, Triagem, Mais)", () => {
  const h = trilho(true);
  const app = itensDaBarra("total").map((i) => i.rotulo);
  const posicoes = app.map((r) => h.indexOf(`>${r}<`));
  verdade(posicoes.every((p) => p >= 0), `faltou alvo: ${app.filter((_, i) => posicoes[i] < 0).join(", ")}`);
  igual([...posicoes].sort((a, b) => a - b), posicoes, "a ordem dos alvos não é a do app: ");
});

teste("TRILHO: quem só vê os próprios não recebe Funil nem Triagem (o alvo some, não fica desabilitado)", () => {
  const h = trilho(false);
  verdade(h.includes(">Conversas<") && h.includes(">Mais<"), "Conversas e Mais existem para todos");
  verdade(!h.includes(">Funil<") && !h.includes(">Triagem<"), "Funil/Triagem apareceram para quem só vê os próprios");
});

teste("TRILHO: um alvo aceso (aria-current), e o selo da Triagem conta quem espera", () => {
  const h = trilho(true, "funil", 7);
  igual((h.match(/aria-current="page"/g) ?? []).length, 1);
  verdade(/aria-current="page"[^>]*data-alvo="funil"/.test(h), "o alvo aceso não é o Funil");
  verdade(h.includes('aria-label="7 esperando resposta"'), "o selo da Triagem não diz quantos esperam");
  verdade(!trilho(true, "conversas", 0).includes("esperando resposta"), "selo com zero");
});

teste("FILA VIVA: as duas listas (Central e app) entregam o contrato do FLIP", () => {
  for (const arq of [["components", "atendimento", "ListaDeConversas.tsx"], ["components", "atendimento-app", "ListaDeConversasApp.tsx"]]) {
    const c = codigoDe(le(...arq));
    verdade(/<ListaViva\b/.test(c), `${arq.at(-1)}: não usa ListaViva`);
    for (const atributo of ["data-linha-viva", "data-marca", "data-esperando"]) verdade(c.includes(atributo), `${arq.at(-1)}: sem ${atributo}`);
  }
  const viva = codigoDe(le("components", "atendimento", "ListaViva.tsx"));
  verdade(/prefers-reduced-motion/.test(viva), "o FLIP não respeita movimento reduzido");
  verdade(/getBoundingClientRect\(\)\.top - base/.test(viva), "a posição não é medida em relação à lista (a rolagem viraria deslize falso)");
});

teste("ENVIO OTIMISTA: se o servidor recusa, o balão provisório some e o texto volta para a caixa", () => {
  const c = codigoDe(le("components", "WhatsappReplyBox.tsx"));
  // O ramo do envio otimista vai do `if (app) {` até a transição do caminho antigo (a segunda depois dele).
  const inicio = c.indexOf("if (app) {");
  const ramo = c.slice(inicio, c.indexOf("startTransition", c.indexOf("startTransition", inicio) + 1));
  verdade(/avisarEnvio\(\{[^}]*estado: "enviando"/.test(ramo), "o balão não aparece na hora");
  verdade(/if \(res\.error\) \{[\s\S]*?estado: "remover"[\s\S]*?setBody\(text\)/.test(ramo), "a recusa não tira o balão nem devolve o texto");
  verdade(/estado: "enviada"[\s\S]*?router\.refresh\(\)/.test(ramo), "a confirmação não atualiza a conversa");
});

teste("CONVERSA: o acabamento 'app' mostra os tiques de entrega; o portal antigo segue sem eles", () => {
  const agora = new Date("2026-10-15T15:00:00Z");
  const msgs = [
    { id: "a", direction: "IN", porAgente: false, body: "Oi", status: "RECEIVED", createdAt: new Date("2026-10-15T14:00:00Z") },
    { id: "b", direction: "OUT", porAgente: false, body: "Olá", status: "SENT", createdAt: new Date("2026-10-15T14:01:00Z"), entregueEm: agora, lidaEm: agora },
  ];
  const app = renderToStaticMarkup(<Conversa mensagens={msgs} agora={agora} nomeDoAtendente="Ana" acabamento="app" />);
  verdade(app.includes('data-entrega="lida"') && app.includes("bg-atd-balao-out") && app.includes("bg-atd-balao-in"), "o acabamento app sem balões ou sem tique");
  const guias = renderToStaticMarkup(<Conversa mensagens={msgs} agora={agora} nomeDoAtendente="Ana" />);
  verdade(!guias.includes("data-entrega") && !guias.includes("atd-balao"), "o portal antigo mudou");
});

teste("TIQUE: na primeira pintura não se desenha; a mensagem recém-enviada daqui, sim", () => {
  verdade(!renderToStaticMarkup(<MarcaDeEntregaViva entrega="entregue" />).includes("atd-desenha"), "a conversa inteira se desenharia ao abrir");
  verdade(renderToStaticMarkup(<MarcaDeEntregaViva entrega="enviada" desenharAoMontar />).includes("atd-desenha"), "o envio daqui não desenha");
});

teste("MOVIMENTO REDUZIDO: todo movimento novo tem a alternativa (sem deslocamento, fica a opacidade)", () => {
  const i = GLOBAL.indexOf("FILA VIVA E MOVIMENTOS DE APOIO");
  verdade(i > 0, "sem o bloco da fila viva em app/globals.css");
  const bloco = GLOBAL.slice(i);
  const reduzido = bloco.slice(bloco.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const c of [".atd-sai", ".atd-troca", ".atd-desenha", "[data-selo-contagem]"]) verdade(reduzido.includes(c), `${c} sem alternativa reduzida`);
  verdade(/prefers-reduced-motion[\s\S]*\.atd-trilho-ind[\s\S]*transition:\s*none/.test(le("app", "atendimento-central", "atendimento-central.css")), "a pílula do trilho desliza mesmo com movimento reduzido");
});

teste("TEMA: a Central segue o site e o /m segue o PWA, com o MESMO bloco Noite do app", () => {
  verdade(/className="atd-central atendimento-shell atd-tema-do-site atd-central-fixa"/.test(le("app", "atendimento-central", "layout.tsx")), "a Central sem o escopo do app");
  verdade(/atendimento-shell atd-tema-do-pwa/.test(le("app", "m", "(shell)", "atendimento", "layout.tsx")), "o /m/atendimento sem o escopo do app");
  verdade(/\.dark \.atendimento-shell\.atd-tema-do-site,\s*\n\.mobile-dark \.atendimento-shell\.atd-tema-do-pwa,\s*\n\.atendimento-dark \{/.test(GLOBAL), "o bloco Noite não vale para as duas superfícies novas");
});

resumo("Atendimento nas três superfícies — trilho, fila viva, envio otimista (15/10/2026)");
