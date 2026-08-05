/**
 * Prova executável do "Vidro Fosco" (Fase A).
 *
 * Roda SEM subir o app e SEM banco:
 *     npx tsx scripts/testar-mascaramento.ts
 *
 * Não há runner de teste neste projeto (package.json não tem jest/vitest nem script "test"),
 * então isto é um script standalone com asserts próprios. Sai com código 1 se qualquer caso
 * falhar, para poder ser plugado em CI depois.
 *
 * O que ele prova, na ordem:
 *   1. cada função de máscara produz a saída esperada;
 *   2. toda função é IDEMPOTENTE (f(f(x)) === f(x)) e não lança em null/undefined/"";
 *   3. o aplicador recursivo desce por relação aninhada em 2+ níveis e dentro de arrays;
 *   4. campo numérico NUNCA vira string (null se anulável, 0 se obrigatório);
 *   5. objeto de model desconhecido passa intacto;
 *   6. todo campo declarado no mapa existe de verdade no schema (erro de digitação no mapa é
 *      falha silenciosa: o campo simplesmente não seria mascarado).
 */
import {
  maskPersonName,
  maskDocument,
  maskEmail,
  maskPhone,
  maskMoney,
  maskFreeText,
  maskUrl,
  maskProcessNumber,
} from "../lib/supportMasking";
import { maskReadResult, findUnknownMappedFields } from "../lib/supportMaskingApply";

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}\n         esperado: ${e}\n         obtido:   ${a}`);
    console.log(`  FALHA ${label}\n         esperado: ${e}\n         obtido:   ${a}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------------------------
section("1. Funções de máscara");
// ---------------------------------------------------------------------------------------------
// Comprimento é preservado EXATAMENTE (uma bolinha por caractere oculto). O exemplo escrito no
// enunciado ("M••••• A••••••• d• S•••") foi digitado à mão e não fecha com os comprimentos
// reais — Maria(5) aparece com 6, Aparecida(9) com 8, Silva(5) com 4. A regra declarada
// ("preserva a primeira letra de cada palavra e o formato") e o exemplo de maskEmail
// ("joao" -> "j•••", exatamente 4) confirmam que o certo é preservar o comprimento.
check("maskPersonName preserva inicial e comprimento", maskPersonName("Maria Aparecida da Silva"), "M•••• A•••••••• d• S••••");
check("maskPersonName com nome de uma letra", maskPersonName("J"), "J");
check("maskDocument CPF preserva 3 últimos", maskDocument("123.456.789-01"), "•••.•••.••9-01");
check("maskDocument CNPJ preserva 3 últimos", maskDocument("12.345.678/0001-99"), "••.•••.•••/•••1-99");
check("maskDocument OAB", maskDocument("OAB/GO 12.345"), "OAB/GO ••.345");
check("maskEmail preserva domínio", maskEmail("joao@escritorio.com"), "j•••@escritorio.com");
check("maskEmail sem arroba", maskEmail("joaosilva"), "j••••••••");
check("maskPhone preserva DDD e 2 últimos", maskPhone("(62) 99999-1234"), "(62) •••••-••34");
check("maskPhone com DDI", maskPhone("+55 62 99999-1234"), "+55 62 •••••-••34");
check("maskMoney sempre null", maskMoney(15000.5), null);
check("maskFreeText preserva comprimento", maskFreeText("Petição inicial"), "[conteúdo protegido — 15 caracteres]");
check("maskFreeText singular", maskFreeText("x"), "[conteúdo protegido — 1 caractere]");
check("maskUrl", maskUrl("https://drive.google.com/file/d/abc123/view"), "[link protegido]");
check(
  "maskProcessNumber preserva ano/segmento/tribunal",
  maskProcessNumber("0001234-56.2023.8.09.0051"),
  "•••••••-••.2023.8.09.••••"
);
check("maskProcessNumber não-CNJ oculta dígitos", maskProcessNumber("proc 4521/2019"), "proc ••••/••••");

// ---------------------------------------------------------------------------------------------
section("2. Idempotência e entradas vazias");
// ---------------------------------------------------------------------------------------------
const maskers = {
  maskPersonName,
  maskDocument,
  maskEmail,
  maskPhone,
  maskFreeText,
  maskUrl,
  maskProcessNumber,
} as const;

const samples = [
  "Maria Aparecida da Silva",
  "123.456.789-01",
  "joao@escritorio.com",
  "(62) 99999-1234",
  "Petição inicial de cobrança",
  "https://drive.google.com/file/d/abc/view",
  "0001234-56.2023.8.09.0051",
];

for (const [name, fn] of Object.entries(maskers)) {
  let idempotent = true;
  for (const s of samples) {
    const once = fn(s);
    const twice = fn(once as string);
    if (once !== twice) {
      idempotent = false;
      console.log(`         quebrou em ${JSON.stringify(s)}: ${JSON.stringify(once)} -> ${JSON.stringify(twice)}`);
    }
  }
  check(`${name} é idempotente em todas as amostras`, idempotent, true);

  // Nunca lança e devolve o vazio como veio.
  let safe = true;
  try {
    if (fn(null) !== null) safe = false;
    if (fn(undefined) !== undefined) safe = false;
    if (fn("") !== "") safe = false;
  } catch {
    safe = false;
  }
  check(`${name} não lança em null/undefined/""`, safe, true);
}
check("maskMoney não lança em null/undefined", [maskMoney(null), maskMoney(undefined)], [null, null]);

// ---------------------------------------------------------------------------------------------
section("3. Aplicador recursivo: relação aninhada em 2+ níveis e dentro de arrays");
// ---------------------------------------------------------------------------------------------
// Case -> client (nível 1) e Case -> tasks[] -> comments[] (níveis 2 e 3).
const caseRow = {
  id: "case_1",
  officeId: "off_1",
  status: "ATIVO",
  title: "Ação de cobrança",
  processNumber: "0001234-56.2023.8.09.0051",
  caseValue: 15000.5,
  createdAt: new Date("2024-03-01T12:00:00Z"),
  client: {
    id: "cli_1",
    name: "Maria Aparecida da Silva",
    document: "123.456.789-01",
    email: "maria@empresa.com.br",
    type: "PF",
  },
  tasks: [
    {
      id: "task_1",
      title: "Protocolar recurso",
      status: "PENDENTE",
      points: 3,
      comments: [
        { id: "c1", content: "Cliente pediu urgência", authorId: "u1" },
        { id: "c2", content: "Ok", authorId: "u2" },
      ],
    },
  ],
};

const maskedCase = maskReadResult("Case", structuredClone(caseRow)) as typeof caseRow;

check("nível 0: title mascarado", maskedCase.title, "[conteúdo protegido — 16 caracteres]");
check("nível 0: processNumber mascarado", maskedCase.processNumber, "•••••••-••.2023.8.09.••••");
check("nível 0: status intacto", maskedCase.status, "ATIVO");
check("nível 0: id e officeId intactos", [maskedCase.id, maskedCase.officeId], ["case_1", "off_1"]);
check("nível 0: createdAt intacto", maskedCase.createdAt instanceof Date, true);
check("nível 1 (relação): client.name mascarado", maskedCase.client.name, "M•••• A•••••••• d• S••••");
check("nível 1 (relação): client.document mascarado", maskedCase.client.document, "•••.•••.••9-01");
check("nível 1 (relação): client.email mascarado", maskedCase.client.email, "m••••@empresa.com.br");
check("nível 1 (relação): client.type intacto (enum em texto)", maskedCase.client.type, "PF");
check("nível 2 (array de relação): task.title mascarado", maskedCase.tasks[0].title, "[conteúdo protegido — 18 caracteres]");
check("nível 2: task.points intacto (contador)", maskedCase.tasks[0].points, 3);
check("nível 3 (array dentro de array): comment.content mascarado", maskedCase.tasks[0].comments[0].content, "[conteúdo protegido — 22 caracteres]");
check("nível 3: segundo item do array também mascarado", maskedCase.tasks[0].comments[1].content, "[conteúdo protegido — 2 caracteres]");
check("nível 3: authorId intacto (FK)", maskedCase.tasks[0].comments[1].authorId, "u2");

// Array no topo (findMany).
const many = maskReadResult("Client", [
  { id: "a", name: "Ana Souza", phone: "(62) 98888-7766" },
  { id: "b", name: "Bruno Lima", phone: null },
]) as Array<Record<string, unknown>>;
check("findMany: array no topo mascarado item a item", [many[0].name, many[1].name], ["A•• S••••", "B•••• L•••"]);
check("findMany: null continua null", many[1].phone, null);

// ---------------------------------------------------------------------------------------------
section("4. REGRA DE TIPO: campo numérico nunca vira string");
// ---------------------------------------------------------------------------------------------
// Receivable.amount é Float! (obrigatório) -> 0 ; paidAmount é Float? -> null
// Receivable.discount e surcharge são Float! -> 0 ; percentual é Float? -> null
const receivable = maskReadResult("Receivable", {
  id: "r1",
  amount: 2500.75,
  paidAmount: 1000.0,
  discount: 10.5,
  surcharge: 3.25,
  percentual: 20,
  description: "Honorários contratuais",
  status: "PENDENTE",
  installmentNumber: 2,
}) as Record<string, unknown>;

check("amount (Float! obrigatório) vira 0, não string", receivable.amount, 0);
check("typeof amount continua number", typeof receivable.amount, "number");
check("paidAmount (Float? anulável) vira null", receivable.paidAmount, null);
check("discount (Float! obrigatório) vira 0", receivable.discount, 0);
check("surcharge (Float! obrigatório) vira 0", receivable.surcharge, 0);
check("percentual (Float? anulável) vira null", receivable.percentual, null);
check("description (String) continua string", typeof receivable.description, "string");
check("installmentNumber intacto (contador, fora do mapa)", receivable.installmentNumber, 2);

// Nenhum campo numérico do mapa inteiro pode virar string, em nenhum model.
const allNumericStayNumeric = (() => {
  const probe = maskReadResult("Case", {
    caseValue: 1,
    convictionValue: 2,
    economicBenefitValue: 3,
    agreementValue: 4,
  }) as Record<string, unknown>;
  return Object.values(probe).every((v) => v === null || typeof v === "number");
})();
check("valores de Case: todos null ou number (nunca string)", allNumericStayNumeric, true);

// aggregate: _sum mascarado, _count preservado.
const agg = maskReadResult("Receivable", {
  _sum: { amount: 91234.5, paidAmount: 5000 },
  _count: { _all: 42 },
  _avg: { amount: 300.1 },
}) as Record<string, Record<string, unknown>>;
check("aggregate: _sum.amount mascarado como number", agg._sum.amount, 0);
check("aggregate: _sum.paidAmount anulável vira null", agg._sum.paidAmount, null);
check("aggregate: _avg.amount mascarado como number", agg._avg.amount, 0);
check("aggregate: _count preservado (contador é diagnóstico)", agg._count._all, 42);

// ---------------------------------------------------------------------------------------------
section("5. Model desconhecido passa intacto");
// ---------------------------------------------------------------------------------------------
const unknownModel = maskReadResult("ModelQueNaoExiste", { name: "Maria Silva", amount: 999 });
check("model fora do DMMF passa intacto", unknownModel, { name: "Maria Silva", amount: 999 });

const noModel = maskReadResult(undefined, { name: "Maria Silva" });
check("sem nome de model passa intacto ($queryRaw)", noModel, { name: "Maria Silva" });

// Model conhecido mas SEM campos sigiloso próprios continua descendo para as relações.
const catalog = maskReadResult("FinancialCategory", { id: "cat1", name: "Honorários", kind: "RECEITA" });
check("model conhecido fora do mapa passa intacto", catalog, { id: "cat1", name: "Honorários", kind: "RECEITA" });

// ---------------------------------------------------------------------------------------------
section("6. Integridade do mapa contra o schema real");
// ---------------------------------------------------------------------------------------------
const unknownFields = findUnknownMappedFields();
check("todo campo do mapa existe no schema (DMMF)", unknownFields, []);

// ---------------------------------------------------------------------------------------------
console.log(`\n${"=".repeat(70)}`);
if (failures.length) {
  console.log(`FALHOU: ${failures.length} caso(s) com problema, ${passed} ok.`);
  process.exit(1);
}
console.log(`TUDO OK: ${passed} verificações passaram.`);
