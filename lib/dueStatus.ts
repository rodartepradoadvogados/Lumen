// Classificador de urgência de prazo — proposta de design "Movimento & Prazos" (setembro/2026).
// Deliberadamente SEPARADO de computeDueStatus (lib/alerts.ts): aquele já é usado, testado e
// correto para a Central de Alertas/e-mails ("hoje" = só hoje, "atrasado" = antes de hoje) — não
// mexer nele evita qualquer risco de regressão na fila de alertas. Este classificador serve um
// propósito diferente (o filete de urgência nas listas de compromissos/prazos) e por isso tem um
// terceiro estado que o de alertas não tem: "vencendo" cobre hoje E amanhã (ver token strip do
// documento de proposta), não só hoje.
export type PrazoUrgencia = "vencida" | "vencendo" | "a-vencer";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// `dueDate` é data-calendário pura (meia-noite UTC — mesma convenção de formatCalendarDate em
// components/ui.tsx). Comparar direto contra `now` local sem ajuste de fuso classificaria errado
// perto da virada do dia; por isso lemos os componentes de data em UTC antes de montar os
// candidatos de comparação, em vez de comparar os objetos Date brutos.
export function classificarPrazo(dueDate: Date | string, now: Date = new Date()): PrazoUrgencia {
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const dCalendar = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const hoje = startOfDay(now);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  if (dCalendar < hoje) return "vencida";
  if (dCalendar <= endOfDay(amanha)) return "vencendo";
  return "a-vencer";
}

// Filete/borda de urgência — separado da cor de TIPO (que continua no chip/badge, ver
// components/ui.tsx:taskTypeColors e components/AgendaView.tsx:typeMeta.chip). "a-vencer" fica
// neutro de propósito: só o que exige atenção (vencendo/vencida) ganha cor no filete.
export const PRAZO_URGENCIA_BORDER: Record<PrazoUrgencia, string> = {
  vencida: "border-urgente",
  vencendo: "border-aviso",
  "a-vencer": "border-regua-forte",
};

export const PRAZO_URGENCIA_TEXT: Record<PrazoUrgencia, string> = {
  vencida: "text-urgente",
  vencendo: "text-aviso",
  "a-vencer": "text-tx-3",
};

export const PRAZO_URGENCIA_LABEL: Record<PrazoUrgencia, string> = {
  vencida: "vencida",
  vencendo: "vencendo",
  "a-vencer": "a vencer",
};
