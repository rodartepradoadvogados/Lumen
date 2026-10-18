// ============================================================================
// O TEXTO DE ESPERA DE "RESPONDER À ÚLTIMA MENSAGEM" — regra pura (vai ao navegador).
//
// A ação espera o Hermes por até 105 s (ESPERA_MS em lib/hermesPonte.ts) e, no incidente de 15 a 17/10/2026,
// foi exatamente isso que aconteceu: a pessoa tocava no botão e via só "Ana está respondendo…" por quase dois
// minutos, sem saber se travou. Dizer de antemão "pode levar até 2 minutos" (105 s + a folga do servidor) tira
// a dúvida; e depois de ~30 s, quando já passou do tempo normal de uma resposta, o texto muda para dizer que
// a espera CONTINUA — a mudança é o sinal de que a tela não congelou. O erro final não muda: continua vindo
// da própria ação, com o motivo real (lib/motivoDoAtendente.ts).
// ============================================================================

/** Depois disto o texto troca. Uma resposta normal da Ana leva bem menos; 30 s já é "demorando". */
export const ESPERA_LONGA_DA_ANA_MS = 30_000;

/** O texto enquanto a ação roda. `longa` = já passou de ESPERA_LONGA_DA_ANA_MS. */
export function textoDeEsperaDaAna(nomeDoAtendente: string, longa: boolean): string {
  return longa
    ? "Ainda esperando o assistente — pode levar até 2 minutos."
    : `${nomeDoAtendente} está respondendo… pode levar até 2 minutos.`;
}
