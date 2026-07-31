// Helpers puros (sem Prisma) de contagem de prazo processual em dias úteis — fundação para o
// futuro cálculo automático de prazo a partir de uma intimação/citação (ainda sem tela nesta
// fase). Toda data aqui é tratada como DATA-CALENDÁRIO EM UTC-MEIA-NOITE, a mesma convenção já
// usada neste projeto para Task.dueDate e formatCalendarDate (ver components/ui.tsx) — por isso
// só getters UTC (getUTCDate/getUTCDay/getUTCMonth/getUTCFullYear) aparecem abaixo; um getter
// local (getDate/getDay...) sobre meia-noite UTC lida em Brasília (UTC-3) devolveria o dia
// anterior, "perdendo" um dia da contagem.

function utcMidnight(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Domingo de Páscoa pelo algoritmo de Meeus/Butcher (calendário gregoriano) — base de todo
// feriado nacional móvel brasileiro (Carnaval, Sexta-feira Santa, Corpus Christi).
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes0 = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0 = março, 3 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utcMidnight(ano, mes0, dia);
}

// Feriados nacionais de um ano: os 8 fixos por lei/calendário civil (Confraternização Universal,
// Tiradentes, Dia do Trabalho, Independência, Nossa Senhora Aparecida, Finados, Proclamação da
// República, Natal) mais os 4 móveis calculados a partir da Páscoa — Carnaval (segunda e terça,
// 47 dias antes; ponto facultativo na maioria dos fóruns, tratado aqui como não útil pelo mesmo
// motivo de sempre haver expediente reduzido/fechado), Sexta-feira Santa (2 dias antes) e Corpus
// Christi (60 dias depois, também ponto facultativo na maior parte do país mas sem expediente
// forense).
export function feriadosNacionais(ano: number): { date: string; name: string }[] {
  const p = pascoa(ano);
  const feriados = [
    { date: utcMidnight(ano, 0, 1), name: "Confraternização Universal" },
    { date: utcMidnight(ano, 3, 21), name: "Tiradentes" },
    { date: utcMidnight(ano, 4, 1), name: "Dia do Trabalho" },
    { date: utcMidnight(ano, 8, 7), name: "Independência do Brasil" },
    { date: utcMidnight(ano, 9, 12), name: "Nossa Senhora Aparecida" },
    { date: utcMidnight(ano, 10, 2), name: "Finados" },
    { date: utcMidnight(ano, 10, 15), name: "Proclamação da República" },
    { date: utcMidnight(ano, 11, 25), name: "Natal" },
    { date: addDays(p, -47), name: "Carnaval (segunda-feira)" },
    { date: addDays(p, -46), name: "Carnaval (terça-feira)" },
    { date: addDays(p, -2), name: "Sexta-feira Santa" },
    { date: addDays(p, 60), name: "Corpus Christi" },
  ];
  return feriados.map((f) => ({ date: dateKey(f.date), name: f.name })).sort((x, y) => x.date.localeCompare(y.date));
}

// Sábado/domingo (UTC), feriado nacional do ano correspondente à data, ou algum feriado extra
// informado (feriados locais/estaduais/forenses cadastrados pelo escritório — ver model Holiday)
// tornam o dia não útil. Note que isto NÃO considera o recesso forense (ver isSuspensaoForense
// abaixo) — são regras jurídicas distintas, combinadas só dentro de addDiasUteis.
export function isDiaUtil(date: Date, feriadosExtras: { date: string }[] = []): boolean {
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const key = dateKey(date);
  const nacionais = feriadosNacionais(date.getUTCFullYear());
  if (nacionais.some((f) => f.date === key)) return false;
  if (feriadosExtras.some((f) => f.date === key)) return false;
  return true;
}

// CPC art. 220: suspende os prazos processuais entre 20 de dezembro e 20 de janeiro (recesso
// forense), incluindo as duas datas-limite. Não é "feriado" (o fórum pode até funcionar
// administrativamente) — é a CONTAGEM de prazo que fica parada nesse intervalo, retomando em
// 21/01 (ou no próximo dia útil, se este também cair em fim de semana/feriado).
export function isSuspensaoForense(date: Date): boolean {
  const month = date.getUTCMonth(); // 0-based
  const day = date.getUTCDate();
  if (month === 11 && day >= 20) return true; // 20 a 31 de dezembro
  if (month === 0 && day <= 20) return true; // 1 a 20 de janeiro
  return false;
}

// Soma N dias úteis a partir de dataInicial, pulando fim de semana, feriado nacional, feriado
// extra do escritório (Holiday) e o recesso forense do CPC art. 220 — a data de partida em si não
// conta como um dos N dias (a contagem começa no primeiro dia seguinte que for útil e não
// suspenso).
export function addDiasUteis(dataInicial: Date, n: number, feriadosExtras: { date: string }[] = []): Date {
  let atual = dataInicial;
  let restante = n;
  while (restante > 0) {
    atual = addDays(atual, 1);
    if (isSuspensaoForense(atual)) continue;
    if (!isDiaUtil(atual, feriadosExtras)) continue;
    restante--;
  }
  return atual;
}
