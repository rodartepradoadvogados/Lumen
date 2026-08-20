// Vocabulário de eventos/canais/cadências dos Comunicados (documento 06, Fase 3) — módulo puro
// (sem Prisma, sem "use server"), porque lib/actions/comunicados.ts é "use server" e só pode
// exportar funções assíncronas: as constantes abaixo (consumidas tanto pela action quanto pelo
// formulário client) precisam morar num arquivo à parte.

// Só estes 4 podem furar a fila (documento 06: "manter a lista curta é parte do desenho") —
// mesma lista declarada em comentário no schema (NotificationPreference.breakthrough).
export const BREAKTHROUGH_EVENTOS = {
  PRAZO_HOJE: "Prazo vence hoje",
  AUDIENCIA_24H: "Audiência em menos de 24h",
  PUBLICACAO_NOVA: "Publicação nova",
  HONORARIO_RECEBIDO: "Honorário recebido",
} as const;
export type BreakthroughEvento = keyof typeof BREAKTHROUGH_EVENTOS;
export const BREAKTHROUGH_KEYS = Object.keys(BREAKTHROUGH_EVENTOS) as BreakthroughEvento[];

// Tabela evento × (canal, cadência) padrão do documento 06. "Publicação nova no processo" usa a
// MESMA chave PUBLICACAO_NOVA do break-through acima — é o mesmo evento; quando marcado no Bloco
// 2 ele fura a fila em vez de seguir a cadência daqui. "Honorário a receber" (lembrete de
// pendência) é um evento DIFERENTE de "Honorário recebido" (confirmação de pagamento, no bloco
// de exceções) — um é rotina, o outro é notícia que vale a pena saber na hora.
export const PER_EVENT_EVENTOS = {
  PUBLICACAO_NOVA: "Publicação nova no processo",
  PRAZO_VENCENDO: "Prazo vencendo",
  HONORARIO_A_RECEBER: "Honorário a receber",
  COBRANCA_ATRASO: "Cobrança em atraso",
  ANDAMENTO_PROCESSUAL: "Andamento processual",
  TAREFA_DELEGADA: "Tarefa delegada a mim",
  CONVITE_EQUIPE: "Convite de equipe",
} as const;
export type PerEventEvento = keyof typeof PER_EVENT_EVENTOS;

export const CANAIS = ["EMAIL", "PUSH", "IN_APP"] as const;
export type Canal = (typeof CANAIS)[number];
export const CADENCIAS = ["NA_HORA", "DIARIO", "SEMANAL", "NUNCA"] as const;
export type Cadencia = (typeof CADENCIAS)[number];

export type PerEventConfig = Record<PerEventEvento, { canal: Canal; cadencia: Cadencia }>;

// União de todos os eventos que podem existir em NotificationOutbox/EmailTemplate — os 7 de
// "por evento" (Bloco 3) mais os 3 que só existem como exceção (Bloco 2: PRAZO_HOJE,
// AUDIENCIA_24H, HONORARIO_RECEBIDO; PUBLICACAO_NOVA já está nos dois). Usada pelo editor de
// template (admin edita TODOS os 10, não só os 7 de cadência configurável) e pela fila/drenagem.
export type NotificationEvent = PerEventEvento | BreakthroughEvento;
export const ALL_EVENTOS: Record<NotificationEvent, string> = { ...PER_EVENT_EVENTOS, ...BREAKTHROUGH_EVENTOS };
export const ALL_EVENTOS_KEYS = Object.keys(ALL_EVENTOS) as NotificationEvent[];
export function isNotificationEvent(k: string): k is NotificationEvent {
  return k in ALL_EVENTOS;
}

export type ComunicadoPreferencia = {
  digestOn: boolean;
  digestHour: number;
  weekdaysOnly: boolean;
  breakthrough: BreakthroughEvento[];
  perEvent: PerEventConfig;
};

export function isPerEventEvento(k: string): k is PerEventEvento {
  return k in PER_EVENT_EVENTOS;
}

// Padrão do escritório, embutido no código — o schema (documento 06) não tem um model de
// "preferência padrão POR ESCRITÓRIO", só por usuário (NotificationPreference.userId é único);
// "o admin define o padrão do escritório", citado no documento, fica em aberto até existir onde
// gravar esse padrão — por ora, todo mundo sem preferência salva usa exatamente esta tabela.
// TAREFA_DELEGADA: PUSH/NA_HORA (não EMAIL/DIARIO como as demais) — antes do corte do outbox
// (PR "corte") a delegação sempre gerava um push instantâneo (lib/actions/tasks.ts); esse push
// foi removido a favor exclusivo da fila nova, então o padrão embutido aqui precisa reproduzir o
// mesmo comportamento pra quem nunca mexeu na preferência — senão toda delegação de tarefa vira
// silenciosamente "só amanhã no resumo" pra quem não sabia que precisava ir customizar.
export const DEFAULT_PER_EVENT: PerEventConfig = {
  PUBLICACAO_NOVA: { canal: "EMAIL", cadencia: "DIARIO" },
  PRAZO_VENCENDO: { canal: "PUSH", cadencia: "NA_HORA" },
  HONORARIO_A_RECEBER: { canal: "EMAIL", cadencia: "DIARIO" },
  COBRANCA_ATRASO: { canal: "EMAIL", cadencia: "SEMANAL" },
  ANDAMENTO_PROCESSUAL: { canal: "IN_APP", cadencia: "DIARIO" },
  TAREFA_DELEGADA: { canal: "PUSH", cadencia: "NA_HORA" },
  CONVITE_EQUIPE: { canal: "EMAIL", cadencia: "NA_HORA" },
};
export const DEFAULT_BREAKTHROUGH: BreakthroughEvento[] = ["PRAZO_HOJE", "AUDIENCIA_24H"];
