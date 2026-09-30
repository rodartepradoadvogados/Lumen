// ============================================================================
// O CICLO DE ENTREGA DA MENSAGEM (R2A do aplicativo de Atendimento): enviada, entregue, lida, falhou.
//
// Parte PURA (sem banco, sem React): ler o retorno de status de cada provedor e decidir o estado que se mostra.
// O lado de banco está em lib/entregaDaMensagemDb.ts.
//
// AS REGRAS (provadas em lib/testes/atendimentoAppEntrega.teste.ts):
//   - SÓ AVANÇA: enviada (1) < entregue (2) < lida (3). Evento repetido ou fora de ordem não recua nada.
//   - LIDA IMPLICA ENTREGUE: um "lido" que chega antes do "entregue" deixa as duas marcas.
//   - FALHOU só vale para quem ainda não foi entregue. Uma falha que chega DEPOIS de "entregue"/"lida" é ruído e é
//     ignorada; uma entrega/leitura que chega DEPOIS de uma falha do webhook é prova de que chegou e desfaz a falha.
//   - O id que liga o evento à mensagem é o do PROVEDOR (`WhatsappMessage.waMessageId`): o `wamid...` da Meta e o
//     `key.id` da Evolution, os mesmos que o envio já grava.
// ============================================================================

export type EntregaDaMensagem = "enviada" | "entregue" | "lida";

/** O que o provedor diz ter acontecido com uma mensagem NOSSA. */
export type EstadoDoProvedor = "enviada" | "entregue" | "lida" | "falhou";

export type EventoDeEntrega = {
  /** O id da mensagem no provedor (`waMessageId`). */
  waMessageId: string;
  estado: EstadoDoProvedor;
  /** Quando o provedor diz que aconteceu (ou nulo: vale a hora de chegada do evento). */
  quando: Date | null;
  /** Só em `falhou`: o motivo curto, sem dado do cliente. */
  motivo?: string;
  /** Meta: o `phone_number_id`; Evolution: o nome da instância. */
  phoneNumberId?: string;
};

const ORDEM: Record<EntregaDaMensagem, number> = { enviada: 1, entregue: 2, lida: 3 };

/** O estado de entrega que se mostra, a partir do que o banco guarda. `null` = não é (ainda) uma mensagem entregue ao provedor. */
export function entregaDaLinha(m: { direction: string; status: string; entregueEm?: Date | null; lidaEm?: Date | null }): EntregaDaMensagem | null {
  if (m.direction !== "OUT" || m.status !== "SENT") return null;
  if (m.lidaEm) return "lida";
  if (m.entregueEm) return "entregue";
  return "enviada";
}

/** O mais avançado dos dois (nunca recua). O aparelho usa isto ao mesclar o que o servidor devolveu. */
export function entregaMaisAvancada(a: EntregaDaMensagem | null | undefined, b: EntregaDaMensagem | null | undefined): EntregaDaMensagem | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return ORDEM[b] > ORDEM[a] ? b : a;
}

export const ROTULO_DA_ENTREGA: Record<EntregaDaMensagem, string> = { enviada: "Enviada", entregue: "Entregue", lida: "Lida" };

// ── Meta (Cloud API) ─────────────────────────────────────────────────────────

type StatusDaMeta = { id?: string; status?: string; timestamp?: string | number; errors?: { code?: number; title?: string; message?: string }[] };
type PayloadDaMeta = { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; statuses?: StatusDaMeta[] } }[] }[] };

const ESTADO_DA_META: Record<string, EstadoDoProvedor> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou" };

function instanteDeSegundos(v: string | number | undefined): Date | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** O motivo de falha que se guarda: curto, sem número de telefone nem texto livre longo do provedor. */
export function motivoCurto(bruto: string | undefined | null): string | undefined {
  const t = (bruto ?? "").replace(/\s+/g, " ").replace(/\+?\d[\d\s().-]{7,}\d/g, "[número]").trim();
  return t ? t.slice(0, 160) : undefined;
}

/** Lê TODOS os `statuses` de um webhook da Meta (em qualquer `entry`/`changes`). Nada que não seja um dos quatro estados entra. */
export function lerStatusesDaMeta(payload: unknown): EventoDeEntrega[] {
  const saida: EventoDeEntrega[] = [];
  try {
    for (const entrada of (payload as PayloadDaMeta)?.entry ?? []) {
      for (const mudanca of entrada?.changes ?? []) {
        const valor = mudanca?.value;
        const phoneNumberId = valor?.metadata?.phone_number_id;
        for (const s of valor?.statuses ?? []) {
          const estado = ESTADO_DA_META[String(s?.status ?? "").toLowerCase()];
          if (!estado || !s?.id || typeof s.id !== "string") continue;
          const erro = s.errors?.[0];
          saida.push({
            waMessageId: s.id,
            estado,
            quando: instanteDeSegundos(s.timestamp),
            motivo: estado === "falhou" ? motivoCurto(erro?.title || erro?.message || (erro?.code ? `código ${erro.code}` : "")) : undefined,
            phoneNumberId,
          });
        }
      }
    }
  } catch {
    return [];
  }
  return saida;
}

// ── Evolution (MESSAGES_UPDATE) ──────────────────────────────────────────────

type AtualizacaoDaEvolution = {
  keyId?: string;
  messageId?: string;
  key?: { id?: string; fromMe?: boolean };
  fromMe?: boolean;
  status?: string | number;
  update?: { status?: string | number };
};
type EnvelopeDaEvolution = { event?: string; instance?: string; data?: AtualizacaoDaEvolution | AtualizacaoDaEvolution[] };

// A Baileys diz o estado por nome (v2 da Evolution) ou por número (0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED).
const ESTADO_DA_EVOLUTION: Record<string, EstadoDoProvedor | null> = {
  ERROR: "falhou",
  "0": "falhou",
  PENDING: null,
  "1": null,
  SERVER_ACK: "enviada",
  "2": "enviada",
  DELIVERY_ACK: "entregue",
  "3": "entregue",
  READ: "lida",
  "4": "lida",
  PLAYED: "lida",
  "5": "lida",
};

/** O evento é de atualização de status de mensagem da Evolution? (vem ANTES de qualquer consulta ao banco). */
export function ehAtualizacaoDaEvolution(payload: unknown): boolean {
  const e = (payload as EnvelopeDaEvolution)?.event;
  return typeof e === "string" && e.toLowerCase().replace(/_/g, ".") === "messages.update";
}

/** Lê as atualizações de status de um `messages.update` da Evolution. Só de mensagem NOSSA (`fromMe` verdadeiro ou ausente). */
export function lerAtualizacoesDaEvolution(payload: unknown): EventoDeEntrega[] {
  const saida: EventoDeEntrega[] = [];
  try {
    if (!ehAtualizacaoDaEvolution(payload)) return [];
    const e = payload as EnvelopeDaEvolution;
    const instancia = typeof e.instance === "string" ? e.instance : undefined;
    const itens = Array.isArray(e.data) ? e.data : e.data ? [e.data] : [];
    for (const d of itens) {
      const fromMe = d?.fromMe ?? d?.key?.fromMe;
      if (fromMe === false) continue; // recibo de mensagem do CLIENTE: não é nosso
      const id = d?.keyId ?? d?.messageId ?? d?.key?.id;
      const bruto = d?.status ?? d?.update?.status;
      if (!id || typeof id !== "string" || bruto === undefined || bruto === null) continue;
      const estado = ESTADO_DA_EVOLUTION[String(bruto).toUpperCase()];
      if (!estado) continue;
      saida.push({ waMessageId: id, estado, quando: null, motivo: estado === "falhou" ? "o WhatsApp não conseguiu entregar" : undefined, phoneNumberId: instancia });
    }
  } catch {
    return [];
  }
  return saida;
}
