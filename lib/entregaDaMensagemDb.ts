import { prisma } from "@/lib/prisma";
import type { EventoDeEntrega } from "@/lib/entregaDaMensagem";

// O LADO DE BANCO DO CICLO DE ENTREGA (R2A). A regra está em lib/entregaDaMensagem.ts; aqui só se aplica.
//
// CADA PASSO É UM `updateMany` COM A CONDIÇÃO NO `where` (e não "lê, decide, grava"): dois eventos que chegam ao mesmo
// tempo não conseguem recuar um ao outro, e o evento repetido simplesmente não acha linha. O `where` SEMPRE leva o
// `officeId` do escritório dono do webhook e `direction: "OUT"`: id de mensagem de outro escritório, de entrada ou
// desconhecido não casa com nada e passa em silêncio (nem erro, nem pista de que o id existe em outro lugar).
//
// NÃO MEXE em `ultimaAtividadeEm` nem em `waLastMessageAt`: um recibo não sobe a conversa na lista e não conta como
// atividade. NÃO TOCA no envio, na idempotência (PedidoDeEnvioWhatsapp) nem na Ana.
//
// `db` é injetável só para o teste usar um provedor falso; em produção é o `prisma`.

export type BancoDeEntrega = {
  whatsappMessage: {
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

export type ConfigDoProvedor = { officeId: string; provider: string; moduloWhatsapp: boolean } | null;

/** Aplica UM evento a uma mensagem do escritório. Devolve quantas linhas mudaram (0 = repetido, atrasado, alheio ou desconhecido). */
export async function aplicarEventoDeEntrega(officeId: string, e: EventoDeEntrega, db: BancoDeEntrega = prisma, agora: Date = new Date()): Promise<number> {
  const base = { waMessageId: e.waMessageId, officeId, direction: "OUT" };
  const t = e.quando ?? agora;
  let mudou = 0;

  if (e.estado === "entregue" || e.estado === "lida") {
    // Entregue (e lida implica entregue): só preenche quem ainda não tem. Desfaz uma falha do webhook: chegou.
    mudou += (await db.whatsappMessage.updateMany({ where: { ...base, entregueEm: null }, data: { entregueEm: t, status: "SENT", falhaProvedor: null } })).count;
  }
  if (e.estado === "lida") {
    mudou += (await db.whatsappMessage.updateMany({ where: { ...base, lidaEm: null }, data: { lidaEm: t, status: "SENT", falhaProvedor: null } })).count;
  }
  if (e.estado === "falhou") {
    // Só falha quem ainda não foi entregue nem lido; e só uma vez (status SENT no where).
    mudou += (await db.whatsappMessage.updateMany({ where: { ...base, status: "SENT", entregueEm: null, lidaEm: null }, data: { status: "FAILED", falhaProvedor: e.motivo ?? "o WhatsApp não conseguiu entregar" } })).count;
  }
  // "enviada" (Meta `sent`, Evolution SERVER_ACK): o envio já gravou SENT. Nada a avançar.
  return mudou;
}

/** Aplica os eventos, na ordem recebida. Nunca lança por evento ruim: o webhook responde 200 sempre. */
export async function aplicarEventosDeEntrega(officeId: string, eventos: EventoDeEntrega[], db: BancoDeEntrega = prisma, agora: Date = new Date()): Promise<number> {
  let total = 0;
  for (const e of eventos) {
    try {
      total += await aplicarEventoDeEntrega(officeId, e, db, agora);
    } catch (erro) {
      console.error("[whatsapp status] falha ao aplicar o status de uma mensagem:", erro);
    }
  }
  return total;
}

/**
 * META: resolve o escritório de cada `phone_number_id` (só configuração META, com o módulo WhatsApp ligado) e aplica.
 * `buscarConfig` é injetável para o teste.
 */
export async function processarStatusesDaMeta(
  eventos: EventoDeEntrega[],
  opcoes: { db?: BancoDeEntrega; buscarConfig?: (phoneNumberId: string) => Promise<ConfigDoProvedor>; agora?: Date } = {},
): Promise<number> {
  const db = opcoes.db ?? prisma;
  const buscar =
    opcoes.buscarConfig ??
    (async (phoneNumberId: string): Promise<ConfigDoProvedor> => {
      const c = await prisma.whatsappConfig.findUnique({ where: { phoneNumberId }, select: { officeId: true, provider: true, office: { select: { moduloWhatsapp: true } } } });
      return c ? { officeId: c.officeId, provider: c.provider, moduloWhatsapp: c.office.moduloWhatsapp } : null;
    });
  const porNumero = new Map<string, EventoDeEntrega[]>();
  for (const e of eventos) {
    if (!e.phoneNumberId) continue;
    porNumero.set(e.phoneNumberId, [...(porNumero.get(e.phoneNumberId) ?? []), e]);
  }
  let total = 0;
  for (const [phoneNumberId, doNumero] of porNumero) {
    let config: ConfigDoProvedor = null;
    try {
      config = await buscar(phoneNumberId);
    } catch (erro) {
      console.error("[whatsapp status] falha ao resolver o escritório:", erro);
    }
    if (!config || config.provider !== "META" || !config.moduloWhatsapp) continue;
    total += await aplicarEventosDeEntrega(config.officeId, doNumero, db, opcoes.agora);
  }
  return total;
}
