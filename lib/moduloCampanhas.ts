// ============================================================================
// MÓDULO PAGO DE CAMPANHAS — regras puras (Frente A da especificação fechada, aprovada pelo dono
// em entrevista /grill-me). Sem Prisma, sem fetch, sem `Date.now()` implícito: toda função recebe
// a data como parâmetro, como os outros módulos puros da casa (ver lib/dueStatus.ts,
// lib/nivelFinanceiro.ts). UI, cobrança via Asaas, webhook e alerta de VPS são outras frentes;
// aqui só o que se prova sem tela e sem rede — e é lido por quem grava os models de
// prisma/schema.prisma (AssinaturaModuloCampanhas, PerfilCampanhaHermes, CampanhaSlotPago,
// CampanhaPrecoParametro).
// ============================================================================

import { diaDeBrasilia, FUSO_DO_ESCRITORIO } from "@/lib/horaDeBrasilia";
import { LIMITES_DUROS, LIMITE_DA_PERGUNTA } from "@/lib/agenteAtendimento";

// ============================================================================
// 1 · NUMERAÇÃO RELATIVA (§6.1)
//
// "A numeração é sempre relativa ao que está ativo no momento: se uma campanha anterior já foi
// finalizada, a próxima campanha NÃO é contada como '2ª' — é apenas uma nova campanha sucessiva."
//
// O defeito que passa despercebido: contar TODAS as campanhas já criadas (incluindo as
// finalizadas) em vez de só as que estão ativas AGORA. Uma campanha finalizada não ocupa slot —
// libera o lugar dela para a próxima, que volta a ser "a 1ª ativa", de graça na mensalidade.
// ============================================================================

/** Os únicos estados de um slot que CONTAM como ocupando lugar entre as campanhas ativas agora. */
const ESTADOS_DE_SLOT_QUE_OCUPAM_LUGAR = ["SOLICITADO", "APROVADO", "ATIVO"] as const;

export type EstadoDoSlot = "SOLICITADO" | "APROVADO" | "ATIVO" | "FINALIZADO" | "RECUSADO";

/**
 * Quantas campanhas estão ativas AGORA, para efeito de numeração e de preço.
 *
 * Conta a campanha "de graça" (a 1ª, sem CampanhaSlotPago) mais os slots que ainda não foram
 * FINALIZADOS nem RECUSADOS. Uma campanha finalizada NÃO entra na conta, mesmo que tenha
 * existido — é exatamente o caso "finalizei a 1ª, pedi outra" (a nova volta a ser a 1ª).
 */
export function quantasCampanhasAtivasAgora(entrada: {
  /** A campanha "de graça" (sem slot pago) está ativa agora? */
  campanhaBaseAtiva: boolean;
  /** O estado de cada slot pago que já existiu para este escritório. */
  estadosDosSlots: EstadoDoSlot[];
}): number {
  const slotsOcupandoLugar = entrada.estadosDosSlots.filter((e) =>
    (ESTADOS_DE_SLOT_QUE_OCUPAM_LUGAR as readonly string[]).includes(e),
  ).length;
  return (entrada.campanhaBaseAtiva ? 1 : 0) + slotsOcupandoLugar;
}

/**
 * A posição (1ª, 2ª, 3ª...) que uma NOVA campanha ocuparia se fosse ativada agora — sempre
 * relativa ao que está ativo NESTE INSTANTE, nunca ao total histórico.
 */
export function numeroDaProximaCampanha(quantasAtivasAgora: number): number {
  return Math.max(0, quantasAtivasAgora) + 1;
}

/**
 * Precisa de um slot pago (2ª campanha simultânea em diante) ou está coberta pela mensalidade
 * do módulo (a 1ª)? A regra do dono: "valor adicional por campanha ativa simultânea" — a
 * primeira não é adicional a nada.
 */
export function precisaDeSlotPago(numeroDaCampanha: number): boolean {
  return numeroDaCampanha > 1;
}

// ============================================================================
// 2 · ESTADOS — fail-closed. Um texto desconhecido nunca vira "ativo".
//
// Os campos `estado` do schema são texto livre (convenção da casa: sem enum de banco, `db push`
// sem migration). Isso significa que QUALQUER string pode estar gravada ali — um valor digitado
// errado numa migração manual, um enum futuro ainda não coberto aqui. A leitura tem que decidir
// o que fazer com o desconhecido, e a decisão é sempre a mais segura: tratar como desativado.
// ============================================================================

export type EstadoDaAssinatura = "ATIVO" | "CARENCIA" | "DESATIVADO";
const ESTADOS_DE_ASSINATURA_VALIDOS: readonly EstadoDaAssinatura[] = ["ATIVO", "CARENCIA", "DESATIVADO"];

/** Fail-closed: string fora da lista conhecida vira DESATIVADO, nunca ATIVO. */
export function normalizarEstadoDaAssinatura(bruto: string): EstadoDaAssinatura {
  return (ESTADOS_DE_ASSINATURA_VALIDOS as readonly string[]).includes(bruto)
    ? (bruto as EstadoDaAssinatura)
    : "DESATIVADO";
}

export type EstadoDoPerfil = "PROVISIONADO" | "DESATIVADO";
const ESTADOS_DE_PERFIL_VALIDOS: readonly EstadoDoPerfil[] = ["PROVISIONADO", "DESATIVADO"];

/** Fail-closed: string fora da lista conhecida vira DESATIVADO, nunca PROVISIONADO. */
export function normalizarEstadoDoPerfil(bruto: string): EstadoDoPerfil {
  return (ESTADOS_DE_PERFIL_VALIDOS as readonly string[]).includes(bruto) ? (bruto as EstadoDoPerfil) : "DESATIVADO";
}

/**
 * O perfil de campanha responde mensagem agora? As DUAS portas têm que estar abertas: a
 * assinatura em dia (ATIVO ou ainda em CARENCIA — §7 diz que a cobrança diária automática
 * continua durante a carência, o serviço não para nesses 10 dias) e o perfil PROVISIONADO.
 *
 * Motivo sempre por escrito, pelo mesmo padrão de lib/agenteAtendimento.ts:deveResponder — uma
 * decisão que impede o envio de mensagem de campanha tem que virar linha de auditoria legível,
 * não um booleano mudo.
 */
export function perfilPodeResponder(
  estadoDaAssinatura: EstadoDaAssinatura,
  estadoDoPerfil: EstadoDoPerfil,
): { pode: boolean; motivo: string } {
  if (estadoDaAssinatura === "DESATIVADO") {
    return { pode: false, motivo: "assinatura do módulo desativada por inadimplência" };
  }
  if (estadoDoPerfil !== "PROVISIONADO") {
    return { pode: false, motivo: "perfil de campanha não está provisionado no Hermes" };
  }
  return { pode: true, motivo: "assinatura em dia (ou em carência) e perfil provisionado" };
}

// ============================================================================
// 3 · CARÊNCIA — 10 DIAS CORRIDOS, fuso de Brasília (§7).
//
// "Dias corridos, não úteis" — sem exceção de fim de semana ou feriado. O relógio é o DIA DE
// CALENDÁRIO no fuso do escritório (lib/horaDeBrasilia.ts:diaDeBrasilia), reaproveitado em vez de
// reescrito: é o mesmo módulo que já resolve "que dia é hoje em Goiânia" para o resto da casa, e
// duplicar essa conta aqui seria o tipo de coisa que diverge silenciosamente no dia em que um dos
// dois lados for corrigido e o outro não.
//
// POR QUE NÃO SUBTRAIR OS DOIS `Date` EM MILISSEGUNDOS E DIVIDIR POR 86400000: um vencimento às
// 23h59 de um dia e "agora" às 00h01 do dia seguinte são um dia corrido de diferença por
// calendário, mas menos de meia hora em milissegundos — e o inverso também erra (dois instantes
// no mesmo dia civil, more de 20h de diferença em ms, contando zero dias corridos). Contar por
// NÚMERO DE DIA DE CALENDÁRIO (não por duração) é a única conta que bate com "dias corridos" como
// o dono usa a expressão.
// ============================================================================

export const DIAS_DE_CARENCIA = 10;

/** O dia de calendário (fuso do escritório) como um inteiro comparável — só para subtração. */
function diaComoInteiro(d: Date, fuso: string): number {
  const [ano, mes, dia] = diaDeBrasilia(d, fuso).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86_400_000;
}

/**
 * Quantos dias corridos se passaram desde o vencimento, no fuso do escritório. Zero ou negativo
 * quando ainda não venceu (ou vence hoje); positivo a partir do dia seguinte ao vencimento.
 */
export function diasCorridosVencidos(vencimento: Date, agora: Date, fuso: string = FUSO_DO_ESCRITORIO): number {
  return diaComoInteiro(agora, fuso) - diaComoInteiro(vencimento, fuso);
}

/**
 * O estado da assinatura (ou de um slot — a mesma régua vale para os dois, §6.6), calculado a
 * partir do vencimento e de agora, sem depender do que está gravado no banco.
 *
 * A FRONTEIRA É INCLUSIVA NO DIA 10: o dono foi explícito em "10 dias corridos" — o 10º dia
 * ainda é carência (a cobrança diária automática ainda está rodando), e só o 11º dia sem
 * pagamento vira desativação.
 */
export function estadoPorVencimento(vencimento: Date, agora: Date, fuso: string = FUSO_DO_ESCRITORIO): EstadoDaAssinatura {
  const dias = diasCorridosVencidos(vencimento, agora, fuso);
  if (dias <= 0) return "ATIVO";
  if (dias <= DIAS_DE_CARENCIA) return "CARENCIA";
  return "DESATIVADO";
}

// ============================================================================
// 4 · PREÇO — parâmetro nasce nulo, e nulo NUNCA é R$ 0,00 (§2, itens em aberto).
//
// Mesmo padrão de lib/nivelFinanceiro.ts:valoresOuOmissao — a especificação marca os dois
// valores (mensalidade do módulo, preço do slot extra) como EM ABERTO. Mostrar "R$ 0,00" para o
// escritório seria mentir (o módulo não é de graça, só ainda não tem preço decidido); por isso a
// omissão é FALANTE: `{ configurado: false, motivo }`, nunca um número, nunca string vazia.
// ============================================================================

export type ParametrosDePreco = {
  /** CampanhaPrecoParametro.chave = "MENSALIDADE_MODULO". */
  mensalidadeModulo: number | null;
  /** CampanhaPrecoParametro.chave = "SLOT_EXTRA". FIXO — não escalona entre 2º, 3º, 4º slot (§2). */
  precoSlotExtra: number | null;
};

export type PrecoOmitido = { configurado: false; motivo: string };
export type PrecoDoModulo = {
  configurado: true;
  mensalidadeModulo: number;
  precoSlotExtra: number;
  /** Quanto o escritório pagaria por mês HOJE: mensalidade + (preço do slot × slots ativos além da 1ª). */
  totalMensal: number;
};

export const MOTIVO_PRECO_NAO_CONFIGURADO =
  "Preço do módulo de campanhas ainda não configurado pelo painel mestre.";

/**
 * O preço a mostrar ao escritório. Se QUALQUER um dos dois parâmetros não estiver configurado,
 * a resposta inteira é uma omissão — nunca um total calculado com um dos dois lados em branco
 * (isso pareceria um preço de verdade, só que errado).
 */
export function precoAMostrar(
  parametros: ParametrosDePreco,
  quantosSlotsExtrasAtivos: number,
): PrecoDoModulo | PrecoOmitido {
  if (parametros.mensalidadeModulo == null || parametros.precoSlotExtra == null) {
    return { configurado: false, motivo: MOTIVO_PRECO_NAO_CONFIGURADO };
  }
  const slots = Math.max(0, quantosSlotsExtrasAtivos);
  const totalMensal = parametros.mensalidadeModulo + parametros.precoSlotExtra * slots;
  return {
    configurado: true,
    mensalidadeModulo: parametros.mensalidadeModulo,
    precoSlotExtra: parametros.precoSlotExtra,
    totalMensal: Math.round(totalMensal * 100) / 100,
  };
}

// ============================================================================
// 5 · LIMITES DUROS NO PERFIL DE CAMPANHA (§5) — a instrução do escritório NUNCA os revoga.
//
// Reaproveita LIMITES_DUROS e LIMITE_DA_PERGUNTA de lib/agenteAtendimento.ts (a mesma lista, a
// mesma trava de tamanho) em vez de duplicá-los: são os TRÊS MESMOS limites do atendimento normal
// — não fechar contrato, não dar solução jurídica, não prometer resultado —, e uma cópia local
// divergiria no dia em que alguém atualizasse um lado só.
//
// A DIFERENÇA do perfil de campanha, e só ela: PODE falar de preço, condições e fazer CTA — o
// que o atendimento normal não faz. Por isso a composição abaixo acrescenta essa permissão como
// uma CAMADA A MAIS, nunca no lugar dos limites duros, e na mesma ORDEM de camadas de
// montarPergunta (limites primeiro, o que pode depois, a instrução do escritório por último, com
// a frase de desempate no fim) — pela mesma razão de lá: a camada de cima acrescenta e
// especializa, nunca revoga.
// ============================================================================

export const O_QUE_O_PERFIL_DE_CAMPANHA_PODE = [
  "Diferente do atendimento normal, você PODE falar sobre preço, condições de pagamento e fazer uma chamada para ação (CTA): convidar a pessoa a confirmar interesse, mandar um documento ou agendar um horário.",
];

const FRASE_DE_DESEMPATE = "Se algo acima conflitar com 'O QUE VOCÊ NUNCA FAZ', vale o 'NUNCA'.";

export function montarPromptDeCampanha(entrada: {
  nomeDoAtendente: string;
  nomeDoEscritorio: string;
  /** O roteiro da campanha (do que ela trata) — equivalente ao "campanha" de montarPergunta. */
  roteiroDaCampanha: string;
  /** O treinamento do escritório para ESTE perfil (PerfilCampanhaHermes.instrucoes). */
  instrucoesDoEscritorio: string;
  nomeDoCliente: string;
  historico: { de: "cliente" | "escritorio"; texto: string }[];
  mensagem: string;
}): string {
  const total = entrada.historico.length;
  const ultimas = (quantas: number) => entrada.historico.slice(Math.max(0, total - quantas));

  // Mesma disciplina de orçamento de montarPergunta: monta cheio e, se estourar o teto do
  // Hermes, corta o histórico mais velho primeiro — nunca os limites duros, nunca a instrução do
  // escritório, nunca a mensagem de agora.
  for (let n = total; n >= 0; n--) {
    const tentativa = montarUmaVez(entrada, ultimas(n));
    if (tentativa.length <= LIMITE_DA_PERGUNTA) return tentativa;
  }
  return montarUmaVez(entrada, []);
}

function montarUmaVez(
  entrada: Parameters<typeof montarPromptDeCampanha>[0],
  historico: { de: "cliente" | "escritorio"; texto: string }[],
): string {
  const partes: string[] = [];

  partes.push(
    `Você é ${entrada.nomeDoAtendente}, o perfil de campanha do escritório ${entrada.nomeDoEscritorio}. Esta conversa veio de uma campanha de divulgação.`,
  );

  // OS LIMITES DUROS ENTRAM PRIMEIRO E SEMPRE — antes de qualquer coisa que o escritório ou a
  // campanha tenham escrito, exatamente como em montarUmaVez (lib/agenteAtendimento.ts).
  partes.push("\nO QUE VOCÊ NUNCA FAZ (regra do escritório, sem exceção, nem para campanha):", ...LIMITES_DUROS.map((t) => `- ${t}`));

  partes.push("\nO QUE VOCÊ PODE FAZER, DIFERENTE DO ATENDIMENTO NORMAL:", ...O_QUE_O_PERFIL_DE_CAMPANHA_PODE.map((t) => `- ${t}`));

  if (entrada.roteiroDaCampanha.trim()) {
    partes.push("\nO ASSUNTO DESTA CAMPANHA:", entrada.roteiroDaCampanha.trim());
  }

  if (entrada.instrucoesDoEscritorio.trim()) {
    partes.push("\nO QUE ESTE ESCRITÓRIO TREINOU PARA ESTE PERFIL:", entrada.instrucoesDoEscritorio.trim());
  }

  partes.push(`\n${FRASE_DE_DESEMPATE}`);

  if (historico.length > 0) {
    partes.push("\nA CONVERSA ATÉ AQUI:");
    for (const m of historico) {
      partes.push(`${m.de === "cliente" ? entrada.nomeDoCliente : entrada.nomeDoAtendente}: ${m.texto}`);
    }
  }

  partes.push(`\nMENSAGEM DE AGORA, de ${entrada.nomeDoCliente}:`, entrada.mensagem);
  partes.push("\nResponda apenas o que você diria no WhatsApp, sem aspas e sem explicar o que está fazendo.");

  return partes.join("\n");
}
