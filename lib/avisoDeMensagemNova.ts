// ============================================================================
// AVISO DE MENSAGEM NOVA COM O APLICATIVO EM SEGUNDO PLANO — sem push (regras puras; vai ao navegador).
//
// O QUE EXISTE: com o chat ABERTO mas a aba/app fora de vista (outra aba, tela apagada com a página ainda
// viva), o título da aba mostra "(2) Novas mensagens · Atendimento" e, no app instalado, o selo do ícone traz o
// número (`navigator.setAppBadge`). Sai sozinho quando a pessoa volta. Só CONTA mensagens do CLIENTE.
//
// O QUE NÃO EXISTE (e a tela não promete): aviso com o aplicativo FECHADO. Isso é push (FCM/APNs), com
// preferência por usuário, disparo no webhook só para quem vê aquele atendimento e política de privacidade
// atualizada — proposta v2, item N17 / PR 14. Sem ele, quem fechou o app não é avisado.
//
// PRIVACIDADE: o título e o selo levam só o NÚMERO. Nunca o nome do cliente nem o texto (o título aparece na
// lista de abas, no histórico e em telas compartilhadas).
// ============================================================================

const PREFIXO = /^\(\d+\)\s+(Nova mensagem|Novas mensagens)\s+·\s+/;

/** O texto do aviso, sem nome nem conteúdo. */
export function fraseDoAviso(n: number): string {
  return n === 1 ? "Nova mensagem" : "Novas mensagens";
}

/** O título da aba: "(N) Nova mensagem · <título de sempre>". `n <= 0` devolve o título de sempre. */
export function tituloComAviso(tituloDeSempre: string, n: number): string {
  const base = tituloDeSempre.replace(PREFIXO, "");
  if (!Number.isFinite(n) || n <= 0) return base;
  const inteiro = Math.min(Math.floor(n), 99);
  return `(${inteiro}${n > 99 ? "+" : ""}) ${fraseDoAviso(n)} · ${base}`;
}

/** Quantas das mensagens que chegaram são do CLIENTE e de fato novas (nota e aviso de sistema não contam). */
export function novasDoCliente(chegaram: { direction: string; tipo?: string }[]): number {
  return chegaram.filter((m) => m.direction === "IN" && !m.tipo).length;
}

/** O rótulo acessível do botão "↓ N novas": diz o que acontece ao tocar, sem depender da seta. */
export function rotuloDoBotaoDeNovas(n: number): string {
  return n === 1 ? "Ir para o fim da conversa: 1 nova mensagem" : `Ir para o fim da conversa: ${n} novas mensagens`;
}

/** Em segundo plano a busca de novas anda mais devagar (o navegador já esfria os relógios da aba). */
export const INTERVALO_EM_SEGUNDO_PLANO_MS = 60_000;

/**
 * Deve buscar agora? Visível: SEMPRE (o relógio de 15 s, "voltar à aba" e "Responder última mensagem" pedem a
 * busca na hora e o teto de frequência é de quem chama). Fora de vista: só se passou 1 minuto da última.
 */
export function deveBuscarAgora(visivel: boolean, msDesdeAUltimaBusca: number): boolean {
  return visivel || msDesdeAUltimaBusca >= INTERVALO_EM_SEGUNDO_PLANO_MS;
}
