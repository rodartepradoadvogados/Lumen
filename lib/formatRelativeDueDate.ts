// Rótulo de data em linguagem de pessoa — proposta de design "Movimento & Prazos" (apartado,
// item 3): "há N dias"/"Hoje"/"Amanhã"/"em N dias" para o que está dentro de 7 dias (passado ou
// futuro), data por extenso curta ("12 set") além disso. Mesma convenção de fuso de
// formatCalendarDate (components/ui.tsx): `dueDate` é data-calendário pura (meia-noite UTC), lida
// em UTC para não cair um dia a menos em Brasília.
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatRelativeDueDate(dueDate: Date | string, now: Date = new Date()): string {
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const dCalendar = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const hoje = new Date(now);
  hoje.setHours(0, 0, 0, 0);

  const diffDias = Math.round((dCalendar.getTime() - hoje.getTime()) / 86400000);

  if (diffDias < 0) {
    const dias = Math.abs(diffDias);
    return `há ${dias} dia${dias > 1 ? "s" : ""}`;
  }
  if (diffDias === 0) return "Hoje";
  if (diffDias === 1) return "Amanhã";
  if (diffDias <= 7) return `em ${diffDias} dias`;
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
