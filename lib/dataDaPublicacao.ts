// Interpretação da data que o robô traz como texto livre. PURO (sem Prisma) para ser testável.

// dataDisponibilizacao/dataMovimentacao vêm como string livre do robô — tenta parsear
// como data válida; se não der, cai pra dataCaptura (quando o robô salvou o registro).
//
// DATA SÓ COM DIA ("2026-10-09", como o DJEN entrega) é gravada ao MEIO-DIA UTC, nunca à meia-noite.
// `new Date("2026-10-09")` é 00:00 UTC = 21:00 do dia 8 em Brasília, e toda a tela formata e agrupa
// por dia de Brasília: as 148 publicações do DJEN apareciam UM DIA ANTES da data real, e nunca
// caíam no mesmo dia do e-mail do Jusbrasil sobre o mesmo ato. Ao meio-dia UTC o dia de Brasília e o
// dia de Londres coincidem. Data com hora ("2026-07-10T10:00:00") segue como estava.
export function parseDataOuFallback(raw: string | null | undefined, fallback: Date): Date {
  if (raw) {
    const soDia = /^\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(raw);
    const parsed = new Date(soDia ? `${soDia[1]}T12:00:00.000Z` : raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}
