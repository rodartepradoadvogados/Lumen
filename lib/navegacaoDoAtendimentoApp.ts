import type { NivelDeAcesso } from "@/lib/acessoAtendimento";

// ============================================================================
// A NAVEGAÇÃO DO APLICATIVO DE ATENDIMENTO (PWA de celular) — a parte que não toca em React.
//
// ACABAMENTO WHATSAPP (etapa 1, 30/09/2026): a barra inferior tem QUATRO alvos
//
//     Conversas · Funil · Triagem · Mais
//
// e a "nova conversa" saiu da barra: é o BOTÃO FLUTUANTE no canto (`temBotaoNovo`). A regra de quem vê o
// quê NÃO mudou, e MUDA POR NÍVEL DE ACESSO (lib/acessoAtendimento.ts):
//   total     os quatro alvos + o botão flutuante.
//   proprios  três alvos (sem o Funil, porque o funil é do escritório inteiro — a página também barra:
//             a barra só não oferece o que o servidor vai recusar) + o botão flutuante.
//   nenhum    nada: só a tela "Sem acesso" e o botão Sair.
//
// Vive num módulo puro para a regra ser provada sem navegador (lib/testes/atendimentoAppOndaA.teste.ts).
// ============================================================================

export const BASE_DO_APP = "/atendimento-app";

export type ChaveDaAba = "conversas" | "funil" | "novo" | "triagem" | "mais";

export type ItemDaBarra = { chave: ChaveDaAba; rotulo: string; href: string };

const TODOS_OS_ITENS: ItemDaBarra[] = [
  { chave: "conversas", rotulo: "Conversas", href: BASE_DO_APP },
  { chave: "funil", rotulo: "Funil", href: `${BASE_DO_APP}/funil` },
  { chave: "triagem", rotulo: "Triagem", href: `${BASE_DO_APP}/triagem` },
  { chave: "mais", rotulo: "Mais", href: `${BASE_DO_APP}/mais` },
];

/** A "nova conversa": não é alvo da barra, é o botão flutuante do canto. */
export const ITEM_NOVO: ItemDaBarra = { chave: "novo", rotulo: "Nova conversa", href: `${BASE_DO_APP}/novo` };

/** Os alvos da barra inferior, da esquerda para a direita, para este nível. */
export function itensDaBarra(nivel: NivelDeAcesso): ItemDaBarra[] {
  if (nivel === "nenhum") return [];
  return TODOS_OS_ITENS.filter((i) => i.chave !== "funil" || nivel === "total");
}

/** O botão flutuante de nova conversa aparece para quem tem barra (total e próprios), nunca para "nenhum". */
export function temBotaoNovo(nivel: NivelDeAcesso): boolean {
  return nivel !== "nenhum";
}

/**
 * O botão flutuante aparece nas telas de trabalho (Conversas, Funil, Triagem) para quem tem acesso; em
 * "Mais" ele só atrapalharia, e nas telas cheias (conversa, "+") não há barra nem botão.
 */
export function botaoNovoVisivel(nivel: NivelDeAcesso, pathname: string): boolean {
  if (!temBotaoNovo(nivel) || ehTelaCheia(pathname)) return false;
  const [primeiro] = segmentosDoApp(pathname);
  return primeiro === undefined || primeiro === "conversas" || primeiro === "funil" || primeiro === "triagem";
}

/** As telas estáticas do app. Qualquer OUTRO primeiro segmento é o id de uma conversa. */
const SEGMENTOS_ESTATICOS = ["funil", "triagem", "mais", "novo", "alertas", "equipe", "perfil", "tema", "sair", "conversas", "entrar", "respostas-rapidas"];

/** Os segmentos do caminho DEPOIS de /atendimento-app ("" e barra final não contam). */
export function segmentosDoApp(pathname: string): string[] {
  const limpo = (pathname || "").split("?")[0].split("#")[0];
  if (limpo !== BASE_DO_APP && !limpo.startsWith(`${BASE_DO_APP}/`)) return [];
  return limpo.slice(BASE_DO_APP.length).split("/").filter(Boolean);
}

/** `/atendimento-app/<id>` ou `/atendimento-app/<id>/detalhes`. */
export function ehConversa(pathname: string): boolean {
  const [primeiro] = segmentosDoApp(pathname);
  return Boolean(primeiro) && !SEGMENTOS_ESTATICOS.includes(primeiro);
}

/** O id da conversa no caminho, ou null. */
export function idDaConversaNoCaminho(pathname: string): string | null {
  return ehConversa(pathname) ? segmentosDoApp(pathname)[0] : null;
}

/** Qual das duas guias da conversa está aberta. */
export function guiaDaConversa(pathname: string): "chat" | "detalhes" | null {
  if (!ehConversa(pathname)) return null;
  return segmentosDoApp(pathname)[1] === "detalhes" ? "detalhes" : "chat";
}

/**
 * Tela cheia = SEM cabeçalho do app e SEM barra inferior: a conversa (chat e detalhes) e o "+"
 * (novo atendimento). É a regra "ao entrar numa conversa a barra inferior some".
 */
export function ehTelaCheia(pathname: string): boolean {
  const [primeiro] = segmentosDoApp(pathname);
  return primeiro === "novo" || ehConversa(pathname);
}

/** Qual item da barra está aceso em cada caminho (as subtelas de Mais acendem "Mais"). */
export function abaAtiva(pathname: string): ChaveDaAba | null {
  const [primeiro] = segmentosDoApp(pathname);
  if (primeiro === undefined || primeiro === "conversas") return "conversas";
  if (primeiro === "funil" || primeiro === "triagem" || primeiro === "novo" || primeiro === "mais") return primeiro;
  if (["alertas", "equipe", "perfil", "tema", "sair", "respostas-rapidas"].includes(primeiro)) return "mais";
  return ehConversa(pathname) ? "conversas" : null;
}

// ── O BOTÃO VOLTAR ──────────────────────────────────────────────────────────────────────────

/**
 * Para onde o "voltar" do cabeçalho da conversa vai. Regra do plano: voltar segue a pilha
 * (Detalhes -> Chat -> lista). `anterior` é o caminho de onde a pessoa VEIO dentro do app (null se
 * abriu o link direto, ou depois de recarregar).
 *
 *  - de Detalhes: volta ao Chat da mesma conversa (por `back` se foi de lá que veio, senão vai).
 *  - do Chat: volta à lista (por `back` se veio dela — preserva a busca e o chip —, senão vai).
 */
export function destinoDoVoltar(
  tela: "chat" | "detalhes" | "novo",
  idDaConversa: string | null,
  anterior: string | null,
): { tipo: "voltar" } | { tipo: "ir"; href: string } {
  const chat = idDaConversa ? `${BASE_DO_APP}/${idDaConversa}` : BASE_DO_APP;
  const anteriorLimpo = anterior ? anterior.split("?")[0].split("#")[0] : null;
  if (tela === "detalhes") {
    return anteriorLimpo === chat ? { tipo: "voltar" } : { tipo: "ir", href: chat };
  }
  // chat e novo: voltam à lista (ou à tela de onde vieram, quando é uma das abas)
  if (anteriorLimpo && anteriorLimpo.startsWith(BASE_DO_APP) && !ehConversa(anteriorLimpo) && anteriorLimpo !== `${BASE_DO_APP}/novo`) {
    return { tipo: "voltar" };
  }
  return { tipo: "ir", href: BASE_DO_APP };
}

// ── DEPOIS DE SALVAR UMA CONVERSA NOVA ──────────────────────────────────────────────────────

/**
 * Para onde o formulário de "Novo atendimento" leva depois de salvar. O formulário é compartilhado com o site mobile
 * (`/m`): lá continua voltando a `/m`. Dentro do aplicativo de Atendimento (`variante="app"`) volta para o PRÓPRIO
 * aplicativo — antes levava ao app mobile do site, arrancando a pessoa do PWA. Com o id da conversa criada abre a
 * conversa; sem ele, a lista. (Quem cria sempre pode abrir o que criou: o responsável do "próprios" é ele mesmo.)
 */
export function destinoDepoisDeSalvar(ehApp: boolean, idDaConversa: string | null | undefined): string {
  if (!ehApp) return "/m";
  return idDaConversa && /^[A-Za-z0-9_-]{1,64}$/.test(idDaConversa) ? `${BASE_DO_APP}/${idDaConversa}` : BASE_DO_APP;
}
