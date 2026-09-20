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
import { regrasDoPadrao, conhecimentoGeral } from "@/lib/atendimentoPadrao";

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

/**
 * O pedido que vai ao agente, em TRÊS CAMADAS, e a ordem entre elas é regra e não estilo:
 *
 *   1. os LIMITES DUROS, aqui deste arquivo — não fecha contrato, não dá solução, não promete
 *      resultado. Entram SEMPRE, inclusive com tudo o mais vazio.
 *   2. o PADRÃO LÚMEN (lib/atendimentoPadrao.ts) — tom, identidade, honorários, o que pedir.
 *   3. o que o ESCRITÓRIO escreveu, e depois a CAMPANHA, se a conversa veio de uma.
 *
 * A camada de cima acrescenta e especializa. Nunca revoga — e há uma frase dizendo isso ao
 * agente, porque sem ela um texto de escritório entusiasmado ("prometa que resolvemos!")
 * concorreria com o limite duro em pé de igualdade.
 *
 * A CAMPANHA SUBSTITUI O CONHECIMENTO GERAL, não o soma. Numa conversa vinda de anúncio o
 * assunto é um só; despejar as doze áreas do padrão ali convidaria a Ana a conversar sobre o que
 * a campanha não quer — que é exatamente o que o dono pediu para evitar.
 */
// ============================================================================
// COMO O AGENTE PEDE A TRANSFERÊNCIA.
//
// Ele termina a mensagem com uma marca numa linha só — `[[TRANSFERIR:RISCO]]` — e o Lúmen a
// retira antes de mandar para o cliente. O cliente nunca vê a marca.
//
// POR QUE UMA MARCA, E NÃO ADIVINHAR PELO TEXTO. Procurar "vou passar para o advogado" na resposta
// seria adivinhação: a frase muda com o treinamento do escritório, muda de campanha para campanha,
// e um dia alguém escreve "não vou passar para o advogado ainda" e o sistema transfere.
//
// O AGENTE NÃO ESCOLHE PARA QUEM VAI — escolhe só o MOTIVO. Quem traduz motivo em fila é o
// sistema (lib/filaDeTransferencia.ts), porque agente que escolhe destinatário acaba escolhendo
// sempre o mesmo.
// ============================================================================

const GATILHOS = ["RISCO", "PEDIDO", "ROTEIRO", "FORA_DO_ESCOPO", "TETO"] as const;
export type GatilhoLido = (typeof GATILHOS)[number];

const MARCA = /\[\[\s*TRANSFERIR\s*:\s*([A-Z_]+)\s*\]\]/i;

/**
 * Separa a marca do texto que vai ao cliente.
 *
 * A marca é retirada de qualquer lugar da mensagem, e não só do fim: o agente às vezes a põe no
 * meio, e uma marca vazada para o WhatsApp do cliente é constrangimento puro.
 *
 * Motivo desconhecido vira `null` em vez de transferir por precaução: transferir com motivo que
 * ninguém reconhece manda o lead para uma fila escolhida por acaso.
 */
export function extrairTransferencia(resposta: string): { texto: string; gatilho: GatilhoLido | null } {
  const achou = resposta.match(MARCA);
  const texto = resposta.replace(new RegExp(MARCA, "gi"), "").replace(/\n{3,}/g, "\n\n").trim();
  if (!achou) return { texto, gatilho: null };
  const bruto = achou[1].toUpperCase();
  const gatilho = (GATILHOS as readonly string[]).includes(bruto) ? (bruto as GatilhoLido) : null;
  return { texto, gatilho };
}

// ============================================================================
// AS MARCAS DE DECISÃO — recusar, propor, esperar documento.
//
// Mesmo mecanismo da transferência, e pelo mesmo motivo: procurar a intenção no texto da resposta
// seria adivinhação. A diferença é o preço do erro. Uma transferência errada manda o lead para a
// pessoa errada; uma RECUSA errada diz a uma pessoa de verdade que o escritório não vai pegar o
// caso dela.
//
// A MARCA DA PROPOSTA LEVA UM RECADO ATRÁS, e esse recado é interno: a Ana escreve, depois da
// marca, por que acha que o escritório não deveria pegar o caso. Por isso a regra de corte aqui é
// DELIBERADAMENTE BRUTA — da marca em diante, tudo é interno e nada vai para o cliente. Se a Ana
// puser a marca no meio da mensagem, o cliente recebe menos texto do que ela escreveu; o contrário
// (o cliente ler "acho que não devemos pegar este caso") é o erro que não se pode cometer.
// ============================================================================

const EIXOS_DE_RECUSA_LIDOS = ["MATERIA", "COMARCA", "VALOR"] as const;
export type EixoRecusado = (typeof EIXOS_DE_RECUSA_LIDOS)[number];

const MARCA_RECUSA = /\[\[\s*RECUSAR\s*:\s*([A-Z_]+)\s*\]\]/i;
const MARCA_PROPOSTA = /\[\[\s*PROPOR_RECUSA\s*\]\]/i;
const MARCA_DOCUMENTO = /\[\[\s*AGUARDAR_DOCUMENTO\s*\]\]/i;

export type DecisaoDaAna = {
  /** O que vai para o WhatsApp do cliente, já sem marca nenhuma. */
  texto: string;
  gatilho: GatilhoLido | null;
  /** Ela quis encerrar. O sistema ainda confere se o escritório autorizou este eixo. */
  recusa: EixoRecusado | null;
  /** A frase interna que ela escreveu para o escritório. Nunca sai para o cliente. */
  proposta: string | null;
  aguardarDocumento: boolean;
};

export function lerDecisaoDaAna(resposta: string): DecisaoDaAna {
  const bruto = resposta || "";

  // DA PROPOSTA EM DIANTE É TUDO INTERNO. Corta primeiro, antes de qualquer outra leitura.
  const achouProposta = bruto.match(MARCA_PROPOSTA);
  const visivel = achouProposta ? bruto.slice(0, achouProposta.index) : bruto;
  const proposta = achouProposta
    ? bruto
        .slice((achouProposta.index ?? 0) + achouProposta[0].length)
        // Outra marca dentro do recado interno não é decisão, é texto — tira para não virar ruído.
        .replace(new RegExp(MARCA_RECUSA, "gi"), "")
        .replace(new RegExp(MARCA_DOCUMENTO, "gi"), "")
        .replace(new RegExp(MARCA, "gi"), "")
        .replace(/\s+/g, " ")
        .trim() || "(a atendente não explicou o motivo)"
    : null;

  const achouRecusa = visivel.match(MARCA_RECUSA);
  const eixoBruto = achouRecusa?.[1]?.toUpperCase();
  const recusa = (EIXOS_DE_RECUSA_LIDOS as readonly string[]).includes(eixoBruto || "")
    ? (eixoBruto as EixoRecusado)
    : null;

  const aguardarDocumento = MARCA_DOCUMENTO.test(visivel);

  const { texto, gatilho } = extrairTransferencia(
    visivel.replace(new RegExp(MARCA_RECUSA, "gi"), "").replace(new RegExp(MARCA_DOCUMENTO, "gi"), ""),
  );

  return { texto, gatilho, recusa, proposta, aguardarDocumento };
}

export function montarPergunta(entrada: {
  nomeDoAtendente: string;
  nomeDoEscritorio: string;
  instrucoesDoEscritorio: string | null;
  /** O roteiro da campanha, quando a conversa veio de um anúncio. */
  campanha?: string | null;
  /** O contorno do escritório: quando ela pode encerrar, e a trava de que fora dali só propõe. */
  parametros?: string | null;
  nomeDoCliente: string;
  historico: { de: "cliente" | "escritorio"; texto: string }[];
  mensagem: string;
}): string {
  const partes: string[] = [];

  partes.push(...regrasDoPadrao(entrada.nomeDoAtendente, entrada.nomeDoEscritorio));

  partes.push("\nO QUE VOCÊ FAZ:", ...TAREFAS.map((t) => `- ${t}`));

  // A marca vai depois das tarefas e antes dos limites: é procedimento, não permissão.
  partes.push(
    "\nQUANDO PASSAR O CASO ADIANTE: termine a sua mensagem com uma linha contendo apenas a marca abaixo, escolhendo UM motivo. O sistema retira essa linha antes de enviar — o cliente nunca a vê.",
    "  [[TRANSFERIR:RISCO]] — a pessoa insistiu em prazo, valor, resultado ou qualquer coisa que você não pode responder",
    "  [[TRANSFERIR:PEDIDO]] — a pessoa pediu para falar com um advogado",
    "  [[TRANSFERIR:ROTEIRO]] — você terminou a triagem e reuniu o que era preciso",
    "  [[TRANSFERIR:FORA_DO_ESCOPO]] — o assunto não é o desta conversa",
    "  [[TRANSFERIR:TETO]] — a conversa já se alongou demais sem concluir",
    "Escolha o motivo com honestidade: ele decide quem recebe o caso. Você NÃO escolhe a pessoa, e não deve prometer um nome.",
  );

  // Os limites entram depois das tarefas e ANTES de qualquer texto de escritório ou de campanha.
  partes.push("\nO QUE VOCÊ NUNCA FAZ (regra do escritório, sem exceção):", ...LIMITES_DUROS.map((t) => `- ${t}`));

  if (entrada.campanha?.trim()) {
    partes.push("\nESTA CONVERSA VEIO DE UM ANÚNCIO, e o assunto dela é só este:", entrada.campanha.trim());
  } else {
    partes.push("", ...conhecimentoGeral());
  }

  if (entrada.instrucoesDoEscritorio?.trim()) {
    partes.push("\nO QUE ESTE ESCRITÓRIO ACRESCENTA:", entrada.instrucoesDoEscritorio.trim());
  }

  // OS PARÂMETROS ENTRAM DEPOIS DOS LIMITES DUROS E DO TEXTO DO ESCRITÓRIO, e antes da frase que
  // resolve conflito — para que a frase valha também para eles. Um contorno que passasse na frente
  // dos limites duros deixaria um escritório autorizar a Ana a dizer o que ela nunca pode dizer.
  if (entrada.parametros?.trim()) {
    partes.push("\nQUANDO ESTE ESCRITÓRIO NÃO PEGA O CASO:", entrada.parametros.trim());
  }

  if (entrada.campanha?.trim() || entrada.instrucoesDoEscritorio?.trim() || entrada.parametros?.trim()) {
    partes.push("\nSe algo acima conflitar com 'O QUE VOCÊ NUNCA FAZ', vale o 'NUNCA'.");
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
