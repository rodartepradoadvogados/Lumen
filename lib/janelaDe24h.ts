// ============================================================================
// A JANELA DE 24 H DO WHATSAPP — a regra pura, sem banco e sem rede.
//
// Pela Cloud API oficial da Meta, texto livre só é aceito nas 24 h seguintes à ÚLTIMA MENSAGEM DO
// CLIENTE. O Lúmen não envia mensagem-modelo aprovada (ver `iniciarOuRetomarConversa`), então fora da
// janela não há como responder por texto — e o aplicativo diz isso ANTES de a pessoa digitar, em vez
// de deixar tentar e falhar.
//
// CONTA-SE A ÚLTIMA ENTRADA (direction "IN"), e não `Attendance.waLastMessageAt`, que também muda a
// cada mensagem que o escritório envia (auditoria A.26 da proposta): responder não reabre janela.
//
// SÓ A META TEM JANELA. A Evolution (WhatsApp Web) manda como um aplicativo comum e não tem esse
// limite: para ela a janela está sempre aberta e a tela não mostra aviso nenhum. O erro que a própria
// Meta devolve (`extractGraphError`) continua sendo a autoridade quando esta conta erra.
//
// PROTEÇÃO MÍNIMA, NÃO O DESENHO COMPLETO: o aviso é uma frase. A faixa com Ligar, Criar tarefa e
// "Como reabrir?" é a etapa da janela (PR 6 da proposta).
// ============================================================================

export const HORAS_DA_JANELA = 24;
const MS_DA_JANELA = HORAS_DA_JANELA * 3_600_000;

export type JanelaDoWhatsapp =
  | { aberta: true }
  /** `horasDesdeAUltimaEntrada` é nulo quando o cliente nunca escreveu para o número do escritório. */
  | { aberta: false; horasDesdeAUltimaEntrada: number | null };

/** O texto de erro que `sendWhatsappText` devolve quando a Meta recusa por causa da janela. */
export const FRASE_DA_JANELA_NA_META = "fora da janela de 24h do WhatsApp";

export function ehErroDeJanela(erro: string | null | undefined): boolean {
  return Boolean(erro && erro.toLowerCase().includes(FRASE_DA_JANELA_NA_META.toLowerCase()));
}

export function janelaDoWhatsapp(provedor: string | null | undefined, ultimaEntradaEm: Date | null | undefined, agora: Date): JanelaDoWhatsapp {
  if ((provedor || "").toUpperCase() === "EVOLUTION") return { aberta: true };
  if (!ultimaEntradaEm) return { aberta: false, horasDesdeAUltimaEntrada: null };
  const passou = agora.getTime() - ultimaEntradaEm.getTime();
  if (passou < MS_DA_JANELA) return { aberta: true };
  return { aberta: false, horasDesdeAUltimaEntrada: Math.max(HORAS_DA_JANELA, Math.floor(passou / 3_600_000)) };
}

/** A frase honesta do aviso — sem jargão de plataforma (nada de "API", "Meta", "rota"). */
export function fraseDaJanelaFechada(nome: string, janela: Extract<JanelaDoWhatsapp, { aberta: false }>): string {
  const quando =
    janela.horasDesdeAUltimaEntrada === null
      ? `${nome} ainda não escreveu para o número do escritório.`
      : `${nome} escreveu pela última vez há ${janela.horasDesdeAUltimaEntrada} h.`;
  return `${quando} O WhatsApp não deixa responder por texto agora. Quando o cliente escrever, o campo volta sozinho.`;
}
