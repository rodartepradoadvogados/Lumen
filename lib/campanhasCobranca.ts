// ============================================================================
// MÓDULO PAGO DE CAMPANHAS — cobrança e régua de inadimplência (Frente B da especificação
// fechada, §2 e §7). Regras PURAS, sem Prisma nem Asaas — o mesmo padrão de lib/moduloCampanhas.ts
// (Frente A), que este arquivo IMPORTA em vez de reimplementar: a carência de 10 dias corridos,
// os estados fail-closed e a omissão falante de preço já existem lá e são a fonte da verdade.
// Aqui só o que a Frente A não cobria — decidir SE e QUANTO cobrar, e SE hoje é dia de mandar o
// aviso diário de carência — para lib/actions/campanhasCobranca.ts (Prisma, Asaas, e-mail,
// WhatsApp) e o cron (app/api/cron/campanhas-carencia/route.ts) ligarem sem duplicar regra.
// ============================================================================

import { diaDeBrasilia, FUSO_DO_ESCRITORIO } from "@/lib/horaDeBrasilia";
import { estadoPorVencimento, precoAMostrar, type EstadoDaAssinatura, type EstadoDoSlot, type ParametrosDePreco } from "@/lib/moduloCampanhas";

// ============================================================================
// 1 · COBRANÇA — hard gate: preço ausente NUNCA vira cobrança (§2, item em aberto).
//
// "Nenhuma cobrança pode ser gerada com preço ausente — recuse com motivo legível, nunca gere
// R$ 0,00." A checagem é a MESMA `precoAMostrar` da Frente A (mesma omissão falante), não uma
// segunda regra de preço: se ela disser que o preço não está configurado por QUALQUER motivo, a
// cobrança inteira é recusada — nunca uma cobrança "pela metade" com um valor e outro ausente.
// ============================================================================

export type PedidoDeCobranca =
  | { recusado: false; valor: number; descricao: string }
  | { recusado: true; motivo: string };

export const MOTIVO_FORMA_DE_PAGAMENTO_AUSENTE =
  "Forma de pagamento do módulo de campanhas ainda não escolhida — o escritório escolhe no pop-up, antes da aprovação.";

/**
 * A cobrança da MENSALIDADE do módulo: sempre o valor CHEIO de `mensalidadeModulo`, nunca somado
 * ao dos slots — cada slot extra tem a SUA PRÓPRIA cobrança recorrente, à parte (§2: "mensalidade
 * fixa... + valor adicional por campanha ativa simultânea" são DUAS cobranças, nunca uma soma).
 */
export function prepararCobrancaDaMensalidade(
  parametros: ParametrosDePreco,
  quantosSlotsExtrasAtivosAgora: number,
  formaDePagamento: string | null,
  nomeDoEscritorio: string,
): PedidoDeCobranca {
  const preco = precoAMostrar(parametros, quantosSlotsExtrasAtivosAgora);
  if (!preco.configurado) return { recusado: true, motivo: preco.motivo };
  if (!formaDePagamento) return { recusado: true, motivo: MOTIVO_FORMA_DE_PAGAMENTO_AUSENTE };
  return {
    recusado: false,
    valor: preco.mensalidadeModulo,
    descricao: `Módulo de Campanhas Lúmen — mensalidade — ${nomeDoEscritorio}`,
  };
}

/**
 * A cobrança de UM slot extra (2ª campanha simultânea em diante): o valor FIXO de
 * `precoSlotExtra` (§2: "não escalona entre 2ª, 3ª, 4ª..." — cada slot paga o mesmo valor, e
 * quem soma quantos slots existem é a mensalidade total mostrada na tela, não a cobrança
 * individual daqui).
 */
export function prepararCobrancaDoSlotExtra(
  parametros: ParametrosDePreco,
  quantosSlotsExtrasAtivosAgora: number,
  formaDePagamento: string | null,
  nomeDoEscritorio: string,
): PedidoDeCobranca {
  const preco = precoAMostrar(parametros, quantosSlotsExtrasAtivosAgora);
  if (!preco.configurado) return { recusado: true, motivo: preco.motivo };
  if (!formaDePagamento) return { recusado: true, motivo: MOTIVO_FORMA_DE_PAGAMENTO_AUSENTE };
  return {
    recusado: false,
    valor: preco.precoSlotExtra,
    descricao: `Módulo de Campanhas Lúmen — campanha simultânea adicional — ${nomeDoEscritorio}`,
  };
}

// ============================================================================
// 2 · UM AVISO POR DIA, NÃO UM POR EXECUÇÃO (§7).
//
// `ultimoAvisoDiarioEm` é gravado como o DIA DE CALENDÁRIO no fuso do escritório (mesmo formato
// "AAAA-MM-DD" de diaDeBrasilia — não um timestamp), justamente para a comparação ser uma
// igualdade de string, sem depender de hora: rodar a régua às 9h e de novo às 21h do MESMO dia
// tem de dar o mesmo resultado.
// ============================================================================

export function deveEnviarAvisoHoje(ultimoAvisoDiarioEm: string | null, agora: Date, fuso: string = FUSO_DO_ESCRITORIO): boolean {
  if (!ultimoAvisoDiarioEm) return true;
  return ultimoAvisoDiarioEm !== diaDeBrasilia(agora, fuso);
}

// ============================================================================
// 3 · A DECISÃO DO DIA — reaproveita `estadoPorVencimento` (Frente A) para saber em que estado
// o relógio (da assinatura OU do slot — "a mesma função, dois relógios diferentes") está agora,
// e traduz isso em três perguntas que quem chama (Prisma/Asaas/e-mail/WhatsApp) precisa
// responder: qual o estado novo a gravar, se este é o INSTANTE em que a desativação acontece
// (uma ação que só roda UMA vez, na transição, não a cada dia que já está desativado) e se hoje
// é dia de mandar o aviso diário de carência.
// ============================================================================

export type AcaoDoCiclo = {
  estadoNovo: EstadoDaAssinatura;
  /** true SÓ no dia em que o estado passa a DESATIVADO (a transição, não todo dia depois dela). */
  desativarAgora: boolean;
  /** true quando o estado (novo) é CARENCIA e o aviso de hoje ainda não saiu. */
  avisarHoje: boolean;
};

export function decidirAcaoDoCiclo(entrada: {
  /** O que está gravado no banco AGORA, já normalizado fail-closed por quem chama. */
  estadoGravado: EstadoDaAssinatura;
  vencimento: Date;
  agora: Date;
  ultimoAvisoDiarioEm: string | null;
  fuso?: string;
}): AcaoDoCiclo {
  const fuso = entrada.fuso ?? FUSO_DO_ESCRITORIO;
  const estadoNovo = estadoPorVencimento(entrada.vencimento, entrada.agora, fuso);
  return {
    estadoNovo,
    desativarAgora: estadoNovo === "DESATIVADO" && entrada.estadoGravado !== "DESATIVADO",
    avisarHoje: estadoNovo === "CARENCIA" && deveEnviarAvisoHoje(entrada.ultimoAvisoDiarioEm, entrada.agora, fuso),
  };
}

// ============================================================================
// 4 · QUAIS SLOTS PARAM QUANDO O PERFIL DESLIGA (§8) — "campanha e perfil próprio andam juntos,
// não existe fallback para perfil compartilhado". Quando a ASSINATURA (mensalidade) desativa, é
// o perfil inteiro que sai do ar — TODO slot que ainda ocupa lugar precisa ser interrompido
// junto, mesmo que aquele slot específico estivesse com a própria cobrança em dia (o problema não
// é o slot, é que não sobrou perfil para atender nenhuma campanha).
// ============================================================================

export function slotPrecisaSerInterrompido(estado: EstadoDoSlot): boolean {
  return estado !== "FINALIZADO" && estado !== "RECUSADO";
}

// ============================================================================
// 5 · REATIVAÇÃO — o próximo vencimento, um ciclo mensal à frente, a partir de AGORA (não do
// vencimento anterior): um escritório que pagou 15 dias atrasado tem o PRÓXIMO vencimento a
// partir de hoje, não a partir do vencimento antigo (que já passou) — senão a próxima cobrança
// nasceria automaticamente vencida.
// ============================================================================

export function proximoVencimentoMensal(agora: Date): Date {
  const d = new Date(agora.getTime());
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}
