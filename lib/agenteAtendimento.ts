// ============================================================================
// O ATENDENTE DO WHATSAPP — quando ele fala, e o que ele nunca pode dizer.
//
// Este arquivo tem duas partes, e as duas são de segurança, não de conveniência:
//
// 1. A DECISÃO de responder, que é uma função pura e testada. Mensagem enviada a cliente não
//    volta, então a pergunta "ele pode falar aqui?" precisa ter uma resposta que dá para ler,
//    testar e mostrar a alguém — não uma sequência de `if` espalhada pela rota.
//
// 2. OS LIMITES DUROS, que entram no pedido junto com o treinamento do escritório. O dono foi
//    explícito: "não pode fechar contrato, não pode dar solução, prometer resultado". Isso não
//    pode ficar só no texto que o escritório escreve — um escritório distraído apaga, e aí o
//    atendente promete ganho de causa em nome de advogado inscrito na OAB.
//
// A REGRA DO SILÊNCIO é a mais importante das cinco. No instante em que uma pessoa do escritório
// responde naquela conversa, o atendente cala ali para sempre. Um cliente que recebe resposta de
// gente e, na mensagem seguinte, de máquina, descobre na hora com o que estava falando — e essa
// confiança não volta.
// ============================================================================

import { podeResponder } from "@/lib/whatsappEvolution";

export type RegraDoEscritorio = {
  moduloWhatsapp: boolean;
  /** A chave-mestra do escritório. Desligada, nenhuma conversa é respondida. */
  agenteAtivo: boolean;
  agenteTodos: boolean;
  agenteNumeros: string;
};

export type EstadoDaConversa = {
  /** A chave DESTA conversa. */
  agenteResponde: boolean;
  /** Preenchido quando uma pessoa do escritório assumiu. Definitivo. */
  agenteSilenciadoEm: Date | null;
  status: string;
};

export type Veredito = { responde: boolean; motivo: string };

/**
 * A decisão, em ordem de importância. A ordem não é estética: cada porta fechada explica a
 * seguinte, e o motivo volta escrito para virar linha de auditoria.
 */
export function deveResponder(
  escritorio: RegraDoEscritorio,
  conversa: EstadoDaConversa,
  deNumero: string,
): Veredito {
  if (!escritorio.moduloWhatsapp) {
    return { responde: false, motivo: "módulo WhatsApp desligado para este escritório" };
  }
  if (conversa.status === "ARQUIVADO") {
    return { responde: false, motivo: "atendimento arquivado" };
  }
  // O silêncio vem ANTES da chave da conversa de propósito: nem religar a chave traz o atendente
  // de volta depois que um humano assumiu. É a única regra daqui que não tem como desfazer pela
  // tela, e é assim que tem que ser.
  if (conversa.agenteSilenciadoEm) {
    return { responde: false, motivo: "uma pessoa do escritório já respondeu nesta conversa" };
  }
  if (!conversa.agenteResponde) {
    return { responde: false, motivo: "o atendente não está marcado para responder nesta conversa" };
  }
  if (!podeResponder(escritorio, deNumero)) {
    return { responde: false, motivo: "número fora da lista de quem o atendente pode responder" };
  }
  return { responde: true, motivo: "marcado para responder" };
}

// ── O que ele nunca pode fazer ───────────────────────────────────────────────────────────────

/**
 * Os limites que NÃO dependem do que o escritório escreveu no treinamento.
 *
 * Estão em primeira pessoa e no imperativo porque vão dentro do pedido ao agente, e não numa
 * documentação: instrução vaga vira comportamento vago.
 */
export const LIMITES_DUROS = [
  "Você NUNCA fecha contrato, não combina honorário, não aceita proposta e não diz que o escritório aceitou a causa. Se a pessoa quiser contratar, diga que um advogado vai retomar o contato para tratar disso.",
  "Você NUNCA dá a solução jurídica do caso, não diz qual é o direito da pessoa, não orienta o que fazer no processo e não indica peça, prazo ou providência. Orientação jurídica é ato de advogado.",
  "Você NUNCA promete resultado, não estima chance de êxito, não fala em valor de indenização e não diz que a pessoa vai ganhar.",
  "Você NUNCA informa prazo processual, data de audiência ou andamento sem que isso tenha vindo de uma consulta ao sistema; e mesmo assim, diga de onde veio.",
  "Você NUNCA inventa. Se não souber, diga que não sabe e que vai passar ao advogado responsável.",
  "Se a pessoa insistir em qualquer um desses pontos, diga que quem responde isso é o advogado, e que ele vai retomar o contato. Não contorne, não dê meia resposta.",
];

/** O que ele PODE fazer — dito com todas as letras, senão um agente cauteloso não faz nada. */
export const TAREFAS = [
  "Acolher quem escreve, com educação e sem formalidade excessiva.",
  "Fazer a triagem: entender qual é o problema, quando aconteceu, se já existe processo ou atendimento anterior, e em que cidade.",
  "Pedir os documentos que ajudem o advogado a avaliar o caso, um de cada vez, explicando para que serve cada um.",
  "Dizer o que acontece em seguida: que o advogado responsável vai analisar e retomar o contato.",
];

export function montarPergunta(entrada: {
  nomeDoAtendente: string;
  nomeDoEscritorio: string;
  instrucoesDoEscritorio: string | null;
  nomeDoCliente: string;
  historico: { de: "cliente" | "escritorio"; texto: string }[];
  mensagem: string;
}): string {
  const partes: string[] = [];

  partes.push(
    `Você é ${entrada.nomeDoAtendente}, do escritório ${entrada.nomeDoEscritorio}, atendendo pelo WhatsApp.`,
    "Responda em português do Brasil, em no máximo 4 linhas, sem listas numeradas e sem markdown — é uma conversa de WhatsApp.",
  );

  partes.push("\nO QUE VOCÊ FAZ:", ...TAREFAS.map((t) => `- ${t}`));

  // Os limites entram DEPOIS das tarefas e ANTES do treinamento do escritório: o que o escritório
  // escreve pode ampliar o tom, jamais afrouxar a regra. E entram sempre, mesmo com o campo de
  // treinamento vazio.
  partes.push("\nO QUE VOCÊ NUNCA FAZ (regra do escritório, sem exceção):", ...LIMITES_DUROS.map((t) => `- ${t}`));

  if (entrada.instrucoesDoEscritorio?.trim()) {
    partes.push(
      "\nCOMO ESTE ESCRITÓRIO ATENDE (escrito por ele):",
      entrada.instrucoesDoEscritorio.trim(),
      "\nSe algo acima conflitar com 'O QUE VOCÊ NUNCA FAZ', vale o 'NUNCA'.",
    );
  }

  if (entrada.historico.length > 0) {
    partes.push("\nA CONVERSA ATÉ AQUI:");
    for (const m of entrada.historico) {
      partes.push(`${m.de === "cliente" ? entrada.nomeDoCliente : entrada.nomeDoAtendente}: ${m.texto}`);
    }
  }

  partes.push(`\nMENSAGEM DE AGORA, de ${entrada.nomeDoCliente}:`, entrada.mensagem);
  partes.push("\nResponda apenas o que você diria no WhatsApp, sem aspas e sem explicar o que está fazendo.");

  return partes.join("\n");
}
