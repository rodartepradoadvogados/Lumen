// ============================================================================
// ALERTA AOS DONOS DA PLATAFORMA: "A ANA NÃO CONSEGUIU RESPONDER UM CLIENTE" — regras PURAS.
//
// O INCIDENTE QUE MOTIVOU (15 a 17/10/2026): o modelo do Hermes ficou lento, TODA chamada estourou os 105 s
// e a Ana ficou dois dias sem responder sem que ninguém soubesse. `atendenteResponde` devolvia o motivo, mas
// os webhooks ignoram o retorno e o motivo só ia para o log da Vercel. O aviso no chat (NotaDaConversa) só
// ajuda quem abre aquela conversa; este e-mail é para quem administra a plataforma ficar sabendo SEM abrir
// conversa nenhuma.
//
// MESMO MOLDE DE lib/alertaMemoriaHermes.ts: regra pura aqui (sem Prisma, sem fetch, sem e-mail); o banco, a
// trava de corrida e o envio ficam em lib/actions/alertaDaAnaSemResposta.ts.
//
// QUAIS FALHAS ALERTAM — só as de INFRAESTRUTURA, aquelas em que a Ana quis responder e o sistema não deixou:
// Hermes (indisponível, demora, recusou, perfil, inalcançável), ponte não configurada, envio pelo WhatsApp e
// falha inesperada. A RESPOSTA VAZIA fica de fora: é o modelo respondendo mal uma vez, não a máquina caída, e
// alertar toda vez seria o tipo de e-mail que as pessoas aprendem a ignorar. As recusas de trava (módulo
// desligado, agente desligado, conversa silenciada, número fora da lista...) NEM CHEGAM aqui: são escolhas do
// escritório, não defeito.
// ============================================================================

import { deveEnviarAvisoHoje } from "@/lib/campanhasCobranca";

/** Por que a Ana não respondeu, depois de ter decidido que devia. */
export type CausaDaFalhaDaAna =
  | "hermes" // falar com o Hermes falhou (qualquer `FalhaDoHermes` ou erro de rede)
  | "ponte-nao-configurada" // HERMES_URL / HERMES_TOKEN ausentes
  | "envio" // a Meta / a Evolution recusou ou não confirmou a mensagem
  | "inesperada" // exceção que ninguém previu, antes de a mensagem sair
  | "vazia"; // o agente respondeu sem texto — avisa a equipe no chat, mas NÃO manda e-mail

/** Só falha de infraestrutura vira e-mail. A resposta vazia vira aviso no chat, nunca e-mail. */
export function causaAlertaOsDonos(causa: CausaDaFalhaDaAna): boolean {
  return causa !== "vazia";
}

// UM E-MAIL POR DIA, NÃO UM POR CLIENTE — a MESMA régua do alerta de memória (e de lib/campanhasCobranca.ts):
// comparar o dia de calendário de Brasília gravado com o de hoje. Reexportada, e não reescrita, porque é
// literalmente a mesma pergunta ("já avisei hoje?") e uma segunda cópia só criaria a chance de as duas
// divergirem um dia. Com a Ana caída, cada mensagem de cliente falha: sem esta régua seriam centenas de e-mails.
export { deveEnviarAvisoHoje as deveAlertarAnaHoje };

/** O que decide se ESTA falha manda e-mail agora: a causa conta, e o dia também. */
export function deveAlertarOsDonosAgora(causa: CausaDaFalhaDaAna, ultimoAlertaDiarioEm: string | null, agora: Date): boolean {
  return causaAlertaOsDonos(causa) && deveEnviarAvisoHoje(ultimoAlertaDiarioEm, agora);
}

/** O caminho (relativo ao endereço do sistema) que abre a conversa onde o aviso da Ana aparece. */
export function caminhoDaConversaDoAtendimento(attendanceId: string): string {
  return `/atendimento-app/${encodeURIComponent(attendanceId)}`;
}
