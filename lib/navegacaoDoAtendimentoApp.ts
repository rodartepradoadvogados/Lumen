import type { NivelDeAcesso } from "@/lib/acessoAtendimento";

// ============================================================================
// A NAVEGAÇÃO DO APLICATIVO DE ATENDIMENTO (PWA de celular) — a parte que não toca em React.
//
// ONDA A da proposta v2 (docs do PR): a barra inferior, na ordem que o dono pediu, é
//
//     Conversas · Funil · "+" · Triagem · Mais
//
// e MUDA POR NÍVEL DE ACESSO (lib/acessoAtendimento.ts):
//   total     as cinco.
//   proprios  quatro: sem o Funil, porque o funil é do escritório inteiro (a página também barra —
//             a barra só não oferece o que o servidor vai recusar).
//   nenhum    nenhuma: só a tela "Sem acesso" e o botão Sair.
//
// Vive num módulo puro para a regra ser provada sem navegador (lib/testes/atendimentoAppOndaA.teste.ts).
// ============================================================================

export const BASE_DO_APP = "/atendimento-app";

export type ChaveDaAba = "conversas" | "funil" | "novo" | "triagem" | "mais";

export type ItemDaBarra = { chave: ChaveDaAba; rotulo: string; href: string };

const TODOS_OS_ITENS: ItemDaBarra[] = [
  { chave: "conversas", rotulo: "Conversas", href: BASE_DO_APP },
  { chave: "funil", rotulo: "Funil", href: `${BASE_DO_APP}/funil` },
  { chave: "novo", rotulo: "Novo atendimento", href: `${BASE_DO_APP}/novo` },
  { chave: "triagem", rotulo: "Triagem", href: `${BASE_DO_APP}/triagem` },
  { chave: "mais", rotulo: "Mais", href: `${BASE_DO_APP}/mais` },
];

/** Os itens da barra inferior, da esquerda para a direita, para este nível. */
export function itensDaBarra(nivel: NivelDeAcesso): ItemDaBarra[] {
  if (nivel === "nenhum") return [];
  return TODOS_OS_ITENS.filter((i) => i.chave !== "funil" || nivel === "total");
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
