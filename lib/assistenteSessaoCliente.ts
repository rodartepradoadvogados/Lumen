// ============================================================================
// AS CHAVES DE STORAGE DA ANTONELLA, num lugar só.
//
// O widget do computador e a tela do celular usam a MESMA chave de conversa
// ("continuar no computador é a mesma conversa, não duas" — ver MobileAssistente).
// `encerrarAssistenteLocal` é o "esquecer a conversa desta aba": clicado no X do
// widget e chamado por toda saída (logout web, PWA mobile, aviso de inatividade).
//
// `sessionStorage` é o escopo certo: sobrevive a F5 e a atualização de SW/cache,
// morre com a aba/PWA fechado — exatamente a semântica que o dono pediu:
// minimizar mantém, fechar (X) ou deslogar perdem o chat.
//
// O histórico no servidor NÃO some aqui — ele é registro do escritório, não janela
// do navegador. Aqui quem some é a JANELA: na próxima abertura começa conversa nova.
// ============================================================================

export const CHAVE_SESSAO = "lumen:assistente:sessao";

// A janela aberta é persistente: um F5 com a caixa aberta a reabre aberta.
// "0"/ausente = minimizada/fechada. Vive no mesmo sessionStorage da conversa.
export const CHAVE_ABERTURA = "lumen:assistente:aberta";

export function lerChaveAssistente(chave: string): string {
  try {
    return window.sessionStorage.getItem(chave) ?? "";
  } catch {
    // Aba anônima ou dados do site bloqueados: sem storage, o widget segue vivo
    // só que efêmero — é o comportamento de sempre, não um erro.
    return "";
  }
}

export function escreverChaveAssistente(chave: string, valor: string): void {
  try {
    window.sessionStorage.setItem(chave, valor);
  } catch {
    // Sem storage, a conversa/abertura só desta tela; nada a fazer.
  }
}

export function apagarChavesAssistente(...chaves: string[]): void {
  try {
    for (const c of chaves) window.sessionStorage.removeItem(c);
  } catch {
    // Sem storage, não há o que esquecer.
  }
}

/** Esquece a conversa e a janela desta aba. Chamar ANTES de qualquer logout. */
export function encerrarAssistenteLocal(): void {
  apagarChavesAssistente(CHAVE_SESSAO, CHAVE_ABERTURA);
}
