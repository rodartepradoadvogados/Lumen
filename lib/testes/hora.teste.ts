import { teste, igual, verdade, resumo } from "./executar";
import {
  horaDeBrasilia,
  dataDeBrasilia,
  dataEHoraDeBrasilia,
  diaDeBrasilia,
  inicioDoMesEmBrasilia,
  inicioDoProximoMesEmBrasilia,
  inicioDoDiaEmBrasilia,
  lerPeriodoEmBrasilia,
  mesEAnoDeBrasilia,
} from "@/lib/horaDeBrasilia";

// ============================================================================
// O FUSO DO ESCRITÓRIO.
//
// O servidor roda em UTC, e é isso que torna estes testes necessários: eles PASSARIAM sem fuso
// nenhum se rodassem numa máquina configurada em Brasília. Todas as datas aqui são construídas em
// UTC explícito, e o que se confere é o que a pessoa LÊ — não o que o servidor pensa.
//
// O caso que dói é a virada do dia: uma mensagem recebida às 22h30 de terça aparece como 01h30 de
// QUARTA se ninguém disser o fuso. Quem reconstruir a conversa meses depois conta a história
// errada — e não desconfia, porque a hora parece plausível.
// ============================================================================

const utc = (a: number, m: number, d: number, h: number, min = 0) => new Date(Date.UTC(a, m - 1, d, h, min, 0, 0));

// ── A hora ───────────────────────────────────────────────────────────────────────────────────

teste("meio-dia em UTC é nove da manhã em Brasília", () => {
  igual(horaDeBrasilia(utc(2026, 9, 19, 12)), "09:00");
});

teste("a virada do dia não empurra a mensagem para o dia seguinte", () => {
  // Terça, 22h30 em Brasília = quarta, 01h30 em UTC.
  const instante = utc(2026, 9, 16, 1, 30);
  igual(horaDeBrasilia(instante), "22:30");
  igual(dataDeBrasilia(instante), "15/09/2026");
  igual(dataEHoraDeBrasilia(instante), "15/09/2026 22:30");
});

teste("o par data+hora é exatamente o que a tela mostra", () => {
  igual(dataEHoraDeBrasilia(utc(2026, 1, 5, 14, 7)), "05/01/2026 11:07");
});

teste("meia-noite em Brasília não vira o dia anterior", () => {
  // 00:10 do dia 20 em Brasília = 03:10 do dia 20 em UTC.
  igual(dataEHoraDeBrasilia(utc(2026, 9, 20, 3, 10)), "20/09/2026 00:10");
});

teste("a chave de dia serve para agrupar e ordena como texto", () => {
  igual(diaDeBrasilia(utc(2026, 9, 16, 1, 30)), "2026-09-15");
  igual(diaDeBrasilia(utc(2026, 9, 19, 12)), "2026-09-19");
  verdade(diaDeBrasilia(utc(2026, 9, 15, 12)) < diaDeBrasilia(utc(2026, 9, 16, 12)), "a ordem alfabética não bate com a cronológica");
});

teste("aceita string, e não só Date", () => {
  igual(horaDeBrasilia("2026-09-19T12:00:00.000Z"), "09:00");
});

// ── O começo do mês ──────────────────────────────────────────────────────────────────────────

teste("o mês começa à meia-noite de Brasília, e não à meia-noite de Londres", () => {
  const inicio = inicioDoMesEmBrasilia(utc(2026, 9, 19, 12));
  // 1º de setembro, 00:00 em Brasília = 1º de setembro, 03:00 em UTC.
  igual(inicio.toISOString(), "2026-09-01T03:00:00.000Z");
  igual(dataEHoraDeBrasilia(inicio), "01/09/2026 00:00");
});

teste("no dia 1º de manhã, o mês corrente é o que acabou de começar", () => {
  // 1º de setembro, 08:00 em Brasília = 11:00 UTC.
  igual(dataDeBrasilia(inicioDoMesEmBrasilia(utc(2026, 9, 1, 11))), "01/09/2026");
});

teste("no último dia à noite, o mês corrente ainda é o que está acabando", () => {
  // 30 de setembro, 22:00 em Brasília = 1º de outubro, 01:00 UTC — em UTC já virou o mês.
  const instante = utc(2026, 10, 1, 1);
  igual(dataDeBrasilia(instante), "30/09/2026");
  igual(dataDeBrasilia(inicioDoMesEmBrasilia(instante)), "01/09/2026");
});

teste("o fim do período é o começo do mês seguinte, e ele é exclusivo", () => {
  const fim = inicioDoProximoMesEmBrasilia(utc(2026, 9, 19, 12));
  igual(dataEHoraDeBrasilia(fim), "01/10/2026 00:00");
  // Um milissegundo antes ainda é setembro — é isso que "exclusivo" tem que garantir.
  igual(dataDeBrasilia(new Date(fim.getTime() - 1)), "30/09/2026");
});

teste("dezembro vira janeiro do ano seguinte", () => {
  igual(dataEHoraDeBrasilia(inicioDoProximoMesEmBrasilia(utc(2026, 12, 20, 12))), "01/01/2027 00:00");
});

teste("fevereiro funciona, inclusive em ano bissexto", () => {
  igual(dataEHoraDeBrasilia(inicioDoProximoMesEmBrasilia(utc(2028, 2, 10, 12))), "01/03/2028 00:00");
  igual(dataDeBrasilia(new Date(inicioDoProximoMesEmBrasilia(utc(2028, 2, 10, 12)).getTime() - 1)), "29/02/2028");
});

teste("o mês inteiro cabe dentro do intervalo, de ponta a ponta", () => {
  for (const mes of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const meio = utc(2026, mes, 15, 12);
    const de = inicioDoMesEmBrasilia(meio);
    const ate = inicioDoProximoMesEmBrasilia(meio);
    verdade(de < meio && meio < ate, `mês ${mes}: o próprio instante ficou fora do intervalo`);
    const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000);
    verdade(dias >= 28 && dias <= 31, `mês ${mes} ficou com ${dias} dias`);
    igual(dataDeBrasilia(de).slice(0, 2), "01", `mês ${mes}: não começou no dia 1º — `);
  }
});

teste("o começo do mês é exatamente meia-noite, sem sobra de milissegundo", () => {
  // O relógio de verdade não dá números redondos. Se o resto do instante consultado vazar para o
  // resultado, o mês começa alguns milissegundos tarde — meio segundo de caixa fica de fora — e
  // o último dia do mês passa a ser rotulado como o primeiro do mês seguinte. Foi assim que o
  // defeito apareceu na prova de ponta a ponta, e não aqui: todas as datas deste arquivo nasciam
  // com milissegundo zero.
  const bagunçado = new Date("2026-09-19T20:32:54.573Z");
  const inicio = inicioDoMesEmBrasilia(bagunçado);
  igual(inicio.toISOString(), "2026-09-01T03:00:00.000Z");
  igual(inicio.getUTCMilliseconds(), 0);
  igual(inicio.getUTCSeconds(), 0);

  const fim = inicioDoProximoMesEmBrasilia(bagunçado);
  igual(fim.toISOString(), "2026-10-01T03:00:00.000Z");
  // E o rótulo do último dia que ENTRA no período é 30/09, não 01/10.
  igual(dataDeBrasilia(new Date(fim.getTime() - 1)), "30/09/2026");
});

teste("qualquer instante do mês devolve o MESMO começo de mês", () => {
  // Nenhum resto pode sobrar de nenhum dos instantes: todos têm de cair no mesmo milissegundo.
  const instantes = [
    new Date("2026-09-01T03:00:00.001Z"),
    new Date("2026-09-10T07:13:41.999Z"),
    new Date("2026-09-19T20:32:54.573Z"),
    new Date("2026-10-01T02:59:59.999Z"),
  ];
  const todos = instantes.map((i) => inicioDoMesEmBrasilia(i).toISOString());
  for (const t of todos) igual(t, "2026-09-01T03:00:00.000Z", `${todos.join(" | ")}: `);
});

teste("o dia também começa redondo", () => {
  const inicio = inicioDoDiaEmBrasilia(2026, 9, 19);
  igual(inicio.toISOString(), "2026-09-19T03:00:00.000Z");
});

teste("ler um mês devolve começo e fim redondos", () => {
  const p = lerPeriodoEmBrasilia("2026-09");
  verdade(p, "não leu o mês");
  igual(p!.de.toISOString(), "2026-09-01T03:00:00.000Z");
  igual(p!.ate.toISOString(), "2026-10-01T03:00:00.000Z");
});

teste("ler um dia inválido devolve nulo em vez de rolar para o mês seguinte", () => {
  igual(lerPeriodoEmBrasilia("2026-02-30"), null);
  igual(lerPeriodoEmBrasilia("2026-13"), null);
  igual(lerPeriodoEmBrasilia("2026"), null);
  igual(lerPeriodoEmBrasilia("setembro"), null);
  igual(lerPeriodoEmBrasilia(undefined), null);
});

// ── Outro fuso ───────────────────────────────────────────────────────────────────────────────

teste("um escritório em Manaus lê uma hora a menos, e o mês dele começa uma hora depois", () => {
  igual(horaDeBrasilia(utc(2026, 9, 19, 12), "America/Manaus"), "08:00");
  igual(inicioDoMesEmBrasilia(utc(2026, 9, 19, 12), "America/Manaus").toISOString(), "2026-09-01T04:00:00.000Z");
});

teste("mês e ano saem no fuso do escritório, não no do servidor", () => {
  // O caso que o defeito produzia: um contrato aberto às 22h do dia 30 de setembro em Brasília já
  // é 1º de outubro em UTC, e a tela dizia "Desde 10/2026" para algo de setembro. Acontece três
  // horas por dia, na virada do mês — raro o bastante para ninguém ligar os pontos.
  igual(mesEAnoDeBrasilia(new Date("2026-10-01T01:00:00Z")), "09/2026");
  igual(mesEAnoDeBrasilia(new Date("2026-09-30T22:00:00-03:00")), "09/2026");
  igual(mesEAnoDeBrasilia(new Date("2026-10-01T00:30:00-03:00")), "10/2026");
});

resumo("Hora de Brasília");
