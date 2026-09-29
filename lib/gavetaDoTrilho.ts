// A GAVETA DO TRILHO — o estado "aberta/fechada" vive no DOM, num atributo do corpo da Central
// (`.atd-corpo[data-trilho]`), e não em estado de React.
//
// POR QUÊ NO DOM. A grade (app/atendimento-central/atendimento-central.css) decide sozinha se o
// trilho é uma coluna (a partir de 1240px) ou uma gaveta (abaixo disso), e a página é Server
// Component: o botão "Detalhes" (no cabeçalho da conversa), o "Fechar" (dentro do trilho) e a tecla
// Esc ficam em lugares diferentes da árvore e não têm um ancestral de cliente comum. Um atributo
// no corpo é o único ponto que os três enxergam sem transformar a tela inteira em componente de
// cliente. Em 1240px+ o atributo existe mas o CSS o ignora — não há gaveta para abrir.
//
// Módulo neutro (sem "use client"): é importado por dois componentes de cliente, e constante
// compartilhada entre fronteiras não mora em arquivo de cliente (ver o topo de lib/funil.ts).

export const SELETOR_DO_CORPO = ".atd-corpo";

export function corpoDaCentral(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SELETOR_DO_CORPO);
}

export function gavetaEstaAberta(): boolean {
  return corpoDaCentral()?.dataset.trilho === "aberto";
}

export function definirGaveta(aberta: boolean): void {
  const corpo = corpoDaCentral();
  if (!corpo) return;
  if (aberta) corpo.dataset.trilho = "aberto";
  else delete corpo.dataset.trilho;
  document.dispatchEvent(new CustomEvent("atd-gaveta", { detail: { aberta } }));
}
