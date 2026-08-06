/**
 * Prova executável, PURA (sem banco, sem Google/OneDrive/Dropbox), da regra que decide para qual
 * raiz de armazenamento cada Case vai: "Lúmen - Processos" (JUDICIAL/ADMINISTRATIVO) ou
 * "Lúmen - Casos" (qualquer outro type — EXTRAJUDICIAL, os legados ATENDIMENTO/CONSULTIVO, e
 * qualquer valor futuro). Essa regra é o coração desta mudança: getOrCreateCaseFolder em
 * lib/googleDrive.ts / lib/oneDriveStorage.ts / lib/dropboxStorage.ts decide a raiz de pasta NOVA
 * com exatamente esta expressão — naturezaOf(type) === "CASO" ? "Lúmen - Casos" :
 * "Lúmen - Processos" — e scripts/migrar-pastas-casos.ts usa naturezaWhere("CASO") para
 * selecionar quais Case migrar. Testar naturezaOf/naturezaWhere aqui é testar essa decisão sem
 * precisar de rede nem de credencial nenhuma.
 *
 * Roda em qualquer lugar, sem nenhuma variável de ambiente:
 *     npx tsx scripts/testar-regra-raiz-casos.ts
 */
import { naturezaOf, naturezaWhere, parseNaturezaParam, type CaseNatureza } from "../lib/caseNatureza";

let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FALHA ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// Mesma expressão usada de verdade em getOrCreateCaseFolder (lib/googleDrive.ts e equivalentes) —
// duplicada aqui de propósito (não importada de lá) para que este teste continue válido mesmo que
// alguém reescreva a implementação de um jeito diferente, mas equivalente: o que importa é que o
// RESULTADO da raiz escolhida bata com esta tabela, não a forma exata do código que chega lá.
const PROCESSOS_ROOT = "Lúmen - Processos";
const CASOS_ROOT = "Lúmen - Casos";
function rootParaTipo(type: string | null | undefined): string {
  return naturezaOf(type) === "CASO" ? CASOS_ROOT : PROCESSOS_ROOT;
}

section("naturezaOf — processo (JUDICIAL/ADMINISTRATIVO) nunca vira CASO");
check('naturezaOf("JUDICIAL") === "JUDICIAL"', naturezaOf("JUDICIAL") === "JUDICIAL");
check('naturezaOf("ADMINISTRATIVO") === "ADMINISTRATIVO"', naturezaOf("ADMINISTRATIVO") === "ADMINISTRATIVO");
check('rootParaTipo("JUDICIAL") === "Lúmen - Processos"', rootParaTipo("JUDICIAL") === PROCESSOS_ROOT);
check('rootParaTipo("ADMINISTRATIVO") === "Lúmen - Processos"', rootParaTipo("ADMINISTRATIVO") === PROCESSOS_ROOT);

section('naturezaOf — tudo que NÃO é exatamente "JUDICIAL"/"ADMINISTRATIVO" vira CASO');
const tiposDeCaso: (string | null | undefined)[] = [
  "EXTRAJUDICIAL",
  "ATENDIMENTO", // legado
  "CONSULTIVO", // legado
  "QUALQUER_COISA_FUTURA",
  null,
  undefined,
  "", // string vazia — não é "JUDICIAL" nem "ADMINISTRATIVO"
];
for (const t of tiposDeCaso) {
  check(`naturezaOf(${JSON.stringify(t)}) === "CASO"`, naturezaOf(t) === "CASO");
  check(`rootParaTipo(${JSON.stringify(t)}) === "Lúmen - Casos"`, rootParaTipo(t) === CASOS_ROOT);
}

section("naturezaOf — comparação é estrita (case-sensitive, sem trim): variação de grafia cai em CASO");
check('naturezaOf("judicial") === "CASO" (minúsculo não é o valor exato gravado no banco)', naturezaOf("judicial") === "CASO");
check('naturezaOf("Administrativo") === "CASO" (capitalização errada)', naturezaOf("Administrativo") === "CASO");
check('naturezaOf(" JUDICIAL") === "CASO" (espaço não é o valor exato)', naturezaOf(" JUDICIAL") === "CASO");

section('naturezaWhere("CASO") — usado por scripts/migrar-pastas-casos.ts para selecionar quais Case migrar');
const whereCaso = naturezaWhere("CASO") as { type: { notIn: string[] } };
check('naturezaWhere("CASO") exclui exatamente JUDICIAL e ADMINISTRATIVO, mais nada', JSON.stringify(whereCaso.type.notIn.sort()) === JSON.stringify(["ADMINISTRATIVO", "JUDICIAL"]));

const whereProcesso = naturezaWhere("JUDICIAL") as { type: string };
check('naturezaWhere("JUDICIAL") === { type: "JUDICIAL" }', whereProcesso.type === "JUDICIAL");

section("parseNaturezaParam — consistência do filtro ?natureza= da listagem com a mesma regra");
check('parseNaturezaParam("caso") === "CASO"', (parseNaturezaParam("caso") as CaseNatureza) === "CASO");
check('parseNaturezaParam("judicial") === "JUDICIAL"', (parseNaturezaParam("judicial") as CaseNatureza) === "JUDICIAL");
check('parseNaturezaParam("administrativo") === "ADMINISTRATIVO"', (parseNaturezaParam("administrativo") as CaseNatureza) === "ADMINISTRATIVO");
check("parseNaturezaParam(undefined) === null (sem filtro)", parseNaturezaParam(undefined) === null);

console.log(`\n${passed} ok, ${failures.length} falha(s).`);
if (failures.length > 0) {
  console.log("Falharam:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
