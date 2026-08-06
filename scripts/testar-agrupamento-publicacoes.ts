// Prova executável do recorte de dia usado para baixar uma publicação para o escritório inteiro
// (lib/publicationResolution.ts). Não toca no banco: só exercita as funções puras de
// lib/publicationGrouping.ts.
//
// Por que este teste existe: quem cria compromisso a partir de uma publicação baixa TODO o grupo
// (mesmo processo, mesmo dia de Brasília) para todos os advogados. Se o recorte de dia usado na
// consulta discordar em um minuto do critério que a tela usa para montar o card, o resultado é
// silencioso e ruim das duas formas — ou sobra card fantasma na fila dos colegas (irmã de fora
// do intervalo), ou some publicação de OUTRO dia que ninguém assumiu.
//
// Rodar: npx tsx scripts/testar-agrupamento-publicacoes.ts

import { saoPauloDayKey, saoPauloDayRangeUtc, groupPublicationsByProcess } from "../lib/publicationGrouping";

let ok = 0;
let falhas = 0;

function check(nome: string, condicao: boolean) {
  if (condicao) {
    ok++;
    console.log(`  ok    ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}`);
  }
}

// O intervalo devolvido tem que CONTER a própria data e nenhum instante de outro dia de Brasília.
function intervaloCobre(iso: string): boolean {
  const { start, end } = saoPauloDayRangeUtc(iso);
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

console.log("\n1. Fronteira do dia de Brasília (UTC-3, sem horário de verão desde 2019)");

// 02:59Z do dia 11 ainda é 23:59 do dia 10 em Brasília.
check("02:59Z de 11/03 pertence ao dia 10/03 em Brasília", saoPauloDayKey("2026-03-11T02:59:00.000Z") === "2026-03-10");
// 03:00Z do dia 11 já é 00:00 do dia 11 em Brasília.
check("03:00Z de 11/03 pertence ao dia 11/03 em Brasília", saoPauloDayKey("2026-03-11T03:00:00.000Z") === "2026-03-11");

const faixa = saoPauloDayRangeUtc("2026-03-11T12:00:00.000Z");
check("intervalo começa às 03:00Z do próprio dia", faixa.start.toISOString() === "2026-03-11T03:00:00.000Z");
check("intervalo termina às 03:00Z do dia seguinte", faixa.end.toISOString() === "2026-03-12T03:00:00.000Z");
check("intervalo tem exatamente 24 horas", faixa.end.getTime() - faixa.start.getTime() === 24 * 60 * 60 * 1000);

console.log("\n2. O intervalo contém toda publicação do mesmo dia — inclusive nas bordas");
for (const iso of [
  "2026-03-11T03:00:00.000Z", // 00:00 em Brasília
  "2026-03-11T12:34:56.000Z", // meio do dia
  "2026-03-12T02:59:59.999Z", // 23:59:59 em Brasília
]) {
  check(`intervalo cobre ${iso}`, intervaloCobre(iso));
}

// A borda de baixo do dia seguinte NÃO pode cair no intervalo do dia anterior.
const faixaDia10 = saoPauloDayRangeUtc("2026-03-10T15:00:00.000Z");
check(
  "publicação de 11/03 (03:00Z) fica FORA do intervalo do dia 10/03",
  new Date("2026-03-11T03:00:00.000Z").getTime() >= faixaDia10.end.getTime()
);

console.log("\n3. O intervalo bate com o agrupamento que a tela faz");

const PROC = "0801234-55.2026.8.09.0051";
const PROC_MASCARA_DIFERENTE = "08012345520268090051"; // mesmo processo, sem pontuação
const OUTRO_PROC = "0809999-11.2026.8.09.0051";

const itens = [
  { id: "a", source: "DJEN", publishedAt: "2026-03-11T12:00:00.000Z", processNumberRaw: PROC, read: false },
  // Mesma publicação por outra fonte, no mesmo dia, com o número escrito de outro jeito.
  { id: "b", source: "DATAJUD", publishedAt: "2026-03-11T20:00:00.000Z", processNumberRaw: PROC_MASCARA_DIFERENTE, read: false },
  // Perto da meia-noite de Brasília, mas ainda no MESMO dia 11.
  { id: "c", source: "JUSBRASIL_EMAIL", publishedAt: "2026-03-12T02:30:00.000Z", processNumberRaw: PROC, read: false },
  // Mesmo processo, DIA SEGUINTE — evento diferente, card diferente.
  { id: "d", source: "DJEN", publishedAt: "2026-03-12T13:00:00.000Z", processNumberRaw: PROC, read: false },
  // Outro processo no mesmo dia — nunca pode entrar junto.
  { id: "e", source: "DJEN", publishedAt: "2026-03-11T13:00:00.000Z", processNumberRaw: OUTRO_PROC, read: false },
];

const grupos = groupPublicationsByProcess(itens);
const grupoDoDia11 = grupos.find((g) => g.items.some((i) => i.id === "a"))!;
const idsDoDia11 = grupoDoDia11.items.map((i) => i.id).sort();

check("as 3 fontes do mesmo processo no dia 11 viram UM card", idsDoDia11.join(",") === "a,b,c");
check("a publicação do dia 12 do mesmo processo NÃO entra nesse card", !idsDoDia11.includes("d"));
check("o outro processo do dia 11 NÃO entra nesse card", !idsDoDia11.includes("e"));
check("DJEN é a fonte escolhida como principal do card", grupoDoDia11.primary.id === "a");

// O ponto central: o intervalo usado na consulta tem que cobrir exatamente os itens do card.
const faixaDoCard = saoPauloDayRangeUtc(grupoDoDia11.primary.publishedAt);
const dentroDaFaixa = itens
  .filter((i) => {
    const t = new Date(i.publishedAt).getTime();
    return t >= faixaDoCard.start.getTime() && t < faixaDoCard.end.getTime();
  })
  .map((i) => i.id)
  .sort();
check(
  "o intervalo de consulta cobre todos os itens do card (mais os de outro processo, filtrados depois pelo número)",
  dentroDaFaixa.join(",") === "a,b,c,e"
);
check("nenhum item de OUTRO dia entra no intervalo de consulta", !dentroDaFaixa.includes("d"));

console.log("\n4. Publicação sem número de processo reconhecível fica sozinha");
const semNumero = groupPublicationsByProcess([
  { id: "x", source: "MANUAL", publishedAt: "2026-03-11T12:00:00.000Z", processNumberRaw: null, read: false },
  { id: "y", source: "MANUAL", publishedAt: "2026-03-11T12:05:00.000Z", processNumberRaw: null, read: false },
]);
check("duas publicações sem número não são agrupadas entre si", semNumero.length === 2);

console.log(`\n${ok} verificações OK, ${falhas} falha(s).\n`);
if (falhas > 0) process.exit(1);
