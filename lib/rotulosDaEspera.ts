import { telefoneLegivel } from "@/lib/quemEEsteNumero";
import { pareceTelefone } from "@/lib/avisoDeLead";

// ============================================================================
// QUEM ESTÁ ESPERANDO — A PARTE QUE NÃO TOCA NO BANCO.
//
// Separado de lib/esperaDoAtendimento.ts (que faz a consulta) por um motivo concreto, e não por
// gosto de arquitetura: o sino é componente de CLIENTE, e precisa do rótulo da espera. Enquanto
// esse rótulo morava ao lado da consulta, importá-lo arrastava `@/lib/prisma` para o pacote do
// navegador — e o build quebrava com "You're importing a component that needs next/headers".
//
// A regra que isto deixa escrita: o que a tela do navegador precisa ler mora aqui; o que fala com
// o banco mora lá. Uma definição só, dois lados.
// ============================================================================

export type QuemEspera = {
  id: string;
  nome: string;
  /** A última mensagem, como ela aparece na lista: entre aspas, cortada pela tela. */
  ultimaMensagem: string | null;
  /** Minutos desde a última mensagem do cliente. Nulo quando não há ninguém esperando. */
  esperandoHa: number | null;
  /** A última palavra é do escritório — ninguém está esperando nesta conversa. */
  respondido: boolean;
  campanha: string | null;
  responsavel: string | null;
  /** Repassado a quem está olhando. Muda a cor da tarja, porque muda de quem é a obrigação. */
  meu: boolean;
  /** O prazo gravado, em ISO — o chip do relógio conta a partir dele, no navegador. */
  prazoISO: string | null;
  /** Qual volta da fila este lead está dando: 1ª, 2ª, 3ª. Ver lerJaTentaram. */
  voltaDaFila: number;
};

/** "11 min", "3h", "2d" — a espera em uma palavra, que é o que cabe na linha de uma lista. */
export function rotuloDaEspera(minutos: number | null): string | null {
  if (minutos === null) return null;
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}

/**
 * Do maior tempo de espera para o menor; quem já foi respondido vai para o fim.
 *
 * Empate resolvido pelo id, e não deixado ao acaso: sem critério final a lista troca de ordem entre
 * duas leituras do banco, e uma lista que se mexe sozinha é uma lista em que não se confia.
 */
export function ordenarPorEspera(a: QuemEspera, b: QuemEspera): number {
  if (a.esperandoHa === null && b.esperandoHa === null) return a.id.localeCompare(b.id);
  if (a.esperandoHa === null) return 1;
  if (b.esperandoHa === null) return -1;
  if (a.esperandoHa !== b.esperandoHa) return b.esperandoHa - a.esperandoHa;
  return a.id.localeCompare(b.id);
}

/** "1ª vez na fila", "3ª vez na fila" — quantas voltas este lead já deu sem ninguém responder. */
export function rotuloDaVolta(volta: number): string {
  return `${Math.max(1, volta)}ª vez na fila`;
}

/**
 * Com quem o lead está agora.
 *
 * Sem responsável NÃO é "ninguém": é a recepção, que é quem atende o que chega sem dono. Escrever
 * "sem responsável" aqui faria a fila parecer abandonada quando ela está exatamente onde deveria.
 */
export function comQuemEsta(q: QuemEspera): string {
  return q.responsavel || "Recepção";
}

/** Uma linha de contexto: de onde veio e de quem é. */
export function procedencia(q: QuemEspera): string {
  return [q.campanha || "sem campanha", q.meu ? "seu" : q.responsavel || "sem responsável"].join(" · ");
}

/**
 * O nome que a lista mostra.
 *
 * Quando o WhatsApp não manda o nome do perfil, `clientName` nasce com o próprio número — e
 * "5562996142280" colado numa lista não é nome nem é telefone: é um dado que ninguém lê. Se o que
 * está ali é um número, ele é escrito como número.
 */
export function nomeDaLinha(clientName: string | null | undefined, waPhone: string | null | undefined): string {
  const nome = (clientName || "").trim();
  if (nome && !pareceTelefone(nome)) return nome;
  return telefoneLegivel(nome || waPhone) || "Sem nome";
}
