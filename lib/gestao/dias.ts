import { diaDeBrasilia } from "@/lib/horaDeBrasilia";

// DATAS-CALENDÁRIO da Gestão.
//
// `Task.dueDate` (e o vencimento de conta) nasce de um <input type="date"> e é gravado como
// MEIA-NOITE UTC — a data em si, sem hora. Comparar isso com `new Date()` cru, ou com "hoje" no
// fuso do servidor, erra um dia em Brasília: às 22h de segunda o UTC já é terça, e "vence hoje"
// virava "atrasado". A régua daqui é: "hoje" é o dia de calendário do ESCRITÓRIO (Brasília),
// expresso como meia-noite UTC daquele dia, e tudo o mais se compara em meia-noite UTC.

export const DIA_MS = 86_400_000;

/** O dia de hoje no fuso do escritório, como meia-noite UTC (comparável com `Task.dueDate`). */
export function hojeCalendario(agora: Date = new Date()): Date {
  const [ano, mes, dia] = diaDeBrasilia(agora).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Dias inteiros de `de` até `ate` (ambos meia-noite UTC). Negativo quando `ate` é anterior. */
export function diasEntre(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / DIA_MS);
}

export type SituacaoDoPrazo = "atrasado" | "vence-na-janela" | "adiante";

/**
 * Onde um prazo cai em relação a hoje. Dias CORRIDOS (decisão da Gestão: o alerta de "vence em 7
 * dias" é um aviso de carga, não o cálculo processual do prazo — esse usa lib/prazos.ts). Vencer
 * hoje conta como "vence na janela", não como atrasado: ainda dá tempo.
 */
export function situacaoDoPrazo(dueDate: Date, hoje: Date, janelaEmDias = 7): SituacaoDoPrazo {
  const d = diasEntre(hoje, dueDate);
  if (d < 0) return "atrasado";
  if (d <= janelaEmDias) return "vence-na-janela";
  return "adiante";
}
