import { teste, igual, verdade, resumo } from "./executar";
import { lerData } from "@/lib/assistantTools";

// ============================================================================
// O PERÍODO DA CONSULTA FINANCEIRA.
//
// Perguntaram "contas de setembro de 2026" e o agente respondeu que setembro não existia — porque
// a consulta não tinha período e devolvia os vencimentos mais antigos. O período conserta isso, e
// é preciso que ele esteja certo no lugar mais fácil de errar: o FIM do mês.
//
// Se "2026-09" virasse 01/09 às zero hora nas duas pontas, "de setembro até setembro" seria um
// intervalo de um instante, e a resposta voltaria a ser "não há nada em setembro" — pelo motivo
// novo, com a mesma consequência: o escritório não paga a conta.
// ============================================================================

function iso(d: Date | undefined): string {
  if (!d) return "(nada)";
  const p = (n: number, c = 2) => String(n).padStart(c, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

teste("um mês começa no dia 1 às zero hora", () => {
  igual(iso(lerData("2026-09", false)), "2026-09-01 00:00:00");
});

teste("um mês termina no ÚLTIMO dia, no último segundo", () => {
  igual(iso(lerData("2026-09", true)), "2026-09-30 23:59:59", "setembro tem 30: ");
  igual(iso(lerData("2026-01", true)), "2026-01-31 23:59:59", "janeiro tem 31: ");
  igual(iso(lerData("2026-12", true)), "2026-12-31 23:59:59", "dezembro vira o ano: ");
});

teste("fevereiro sabe de ano bissexto", () => {
  igual(iso(lerData("2026-02", true)), "2026-02-28 23:59:59", "2026 não é bissexto: ");
  igual(iso(lerData("2028-02", true)), "2028-02-29 23:59:59", "2028 é bissexto: ");
});

teste("um dia específico cobre o dia inteiro", () => {
  igual(iso(lerData("2026-09-15", false)), "2026-09-15 00:00:00");
  igual(iso(lerData("2026-09-15", true)), "2026-09-15 23:59:59");
});

teste("o intervalo de um mês contém o mês inteiro", () => {
  // O caso que motivou tudo: "de 2026-09 até 2026-09" tem que conter o dia 30.
  const de = lerData("2026-09", false)!;
  const ate = lerData("2026-09", true)!;
  const trinta = new Date(2026, 8, 30, 14, 0, 0);
  const primeiro = new Date(2026, 8, 1, 0, 30, 0);
  const agosto31 = new Date(2026, 7, 31, 23, 0, 0);
  const outubro1 = new Date(2026, 9, 1, 0, 30, 0);
  verdade(trinta >= de && trinta <= ate, "30 de setembro tem que estar dentro");
  verdade(primeiro >= de && primeiro <= ate, "1º de setembro tem que estar dentro");
  verdade(!(agosto31 >= de && agosto31 <= ate), "31 de agosto tem que ficar de fora");
  verdade(!(outubro1 >= de && outubro1 <= ate), "1º de outubro tem que ficar de fora");
});

teste("o que não é data não vira data", () => {
  // Nulo aqui significa "sem filtro". Uma data inventada a partir de lixo seria pior que nenhuma:
  // filtraria um período que ninguém pediu e devolveria vazio com cara de resposta.
  for (const lixo of ["", "setembro", "09/2026", "2026", "2026-13", "2026-09-32", "ontem"]) {
    const r = lerData(lixo, false);
    igual(r === undefined || Number.isNaN(r.getTime()), true, `${JSON.stringify(lixo)}: `);
  }
  igual(lerData(undefined, false), undefined, "indefinido: ");
});

void resumo("periodo");
