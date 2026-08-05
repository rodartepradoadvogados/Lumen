/**
 * Prova executável da Fase C (comprovação ao escritório-cliente).
 *
 * Roda SEM subir o app e SEM banco (dados fabricados em memória — os dois módulos testados são
 * puros, ver lib/accessLogCsv.ts e lib/supportPreview.ts):
 *     npx tsx scripts/testar-comprovacao.ts
 *
 * O que prova, na ordem:
 *   1. o CSV do extrato é gerado corretamente para um histórico com várias ações (ENTRADA, SAIDA,
 *      LEITURA, PEDIDO, APROVACAO, NEGACAO), inclusive escapando campos com vírgula/aspas e
 *      convertendo outOfBand para "Sim"/"Não";
 *   2. o caso "nenhum acesso no período" produz o texto explícito, sem tabela vazia disfarçando
 *      de erro;
 *   3. a "prévia" (lib/supportPreview.ts) usa EXATAMENTE o mesmo mapa (SUPPORT_MASK_MAP) e o
 *      mesmo motor (maskReadResult) que lib/prisma.ts usa na extensão de produção — provado por
 *      dois ângulos: (a) os campos que a prévia decide mostrar batem, campo por campo, com
 *      Object.keys(SUPPORT_MASK_MAP[model]); (b) o valor mascarado que a prévia produz é
 *      IDÊNTICO ao que sai de uma chamada direta e independente a maskReadResult() com a mesma
 *      entrada — ou seja, não há uma segunda função de máscara escondida na prévia produzindo um
 *      resultado só parecido; e (c) o import de maskReadResult em lib/supportPreview.ts vem do
 *      mesmo caminho de módulo ("@/lib/supportMaskingApply") que lib/prisma.ts importa — mesmo
 *      objeto de função em runtime, não uma cópia.
 */
import { buildAccessLogCsv, safeFileFragment } from "../lib/accessLogCsv";
import type { OfficeAccessLogEntry } from "../lib/supportAccess";
import { buildMaskedComparison, maskKindFor, PREVIEW_MODELS } from "../lib/supportPreview";
import { maskReadResult } from "../lib/supportMaskingApply";
import { SUPPORT_MASK_MAP } from "../lib/supportMaskingMap";
import fs from "node:fs";
import path from "node:path";

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

// ---------------------------------------------------------------------------------------------
section("1. CSV do extrato: histórico com várias ações");
// ---------------------------------------------------------------------------------------------
const NOW = new Date("2026-08-05T15:00:00-03:00");

const log: OfficeAccessLogEntry[] = [
  {
    id: "log1",
    createdAt: new Date("2026-08-01T09:00:00-03:00"),
    memberName: "Ana Suporte",
    reasonLabel: "Diagnosticar erro relatado",
    action: "ENTRADA",
    outOfBand: false,
    durationMinutes: 12,
    scopeDescription: null,
  },
  {
    id: "log2",
    createdAt: new Date("2026-08-01T09:05:00-03:00"),
    memberName: "Ana Suporte",
    reasonLabel: "Diagnosticar erro relatado",
    action: "LEITURA",
    outOfBand: false,
    durationMinutes: null,
    scopeDescription: "processo: Ação, com vírgula e \"aspas\"",
  },
  {
    id: "log3",
    createdAt: new Date("2026-08-01T09:12:00-03:00"),
    memberName: "Ana Suporte",
    reasonLabel: "Diagnosticar erro relatado",
    action: "SAIDA",
    outOfBand: false,
    durationMinutes: 12,
    scopeDescription: null,
  },
  {
    id: "log4",
    createdAt: new Date("2026-08-02T14:00:00-03:00"),
    memberName: "Bruno Suporte",
    reasonLabel: "Incidente de segurança",
    action: "PEDIDO",
    outOfBand: true,
    durationMinutes: null,
    scopeDescription: null,
  },
  {
    id: "log5",
    createdAt: new Date("2026-08-02T14:10:00-03:00"),
    memberName: "Bruno Suporte",
    reasonLabel: "Incidente de segurança",
    action: "APROVACAO",
    outOfBand: true,
    durationMinutes: null,
    scopeDescription: null,
  },
  {
    id: "log6",
    createdAt: new Date("2026-08-03T08:00:00-03:00"),
    memberName: "Carla Suporte",
    reasonLabel: "Corrigir dado incorreto",
    action: "NEGACAO",
    outOfBand: false,
    durationMinutes: null,
    scopeDescription: null,
  },
];

const csvComHistorico = buildAccessLogCsv({ officeName: "Escritório Teste & Associados", days: 90, log, now: NOW });
const linhas = csvComHistorico.split("\r\n");

check("cabeçalho identifica o escritório", linhas.some((l) => l === "Escritório: Escritório Teste & Associados"));
check("cabeçalho identifica o período (90 dias)", linhas.some((l) => l.startsWith("Período:") && l.includes("90 dias")));
check("linha de cabeçalho da tabela presente", linhas.includes("Data/hora,Quem (equipe Lúmen),Ação,Motivo,Registro afetado,Duração,Fora do protocolo normal"));
check("ENTRADA vira \"Entrada\" em português", csvComHistorico.includes(",Entrada,"));
check("SAIDA vira \"Saída\"", csvComHistorico.includes(",Saída,"));
check("LEITURA vira \"Viu dados reais\"", csvComHistorico.includes(",Viu dados reais,"));
check("PEDIDO vira \"Pedido\"", csvComHistorico.includes(",Pedido,"));
check("APROVACAO vira \"Aprovação\"", csvComHistorico.includes(",Aprovação,"));
check("NEGACAO vira \"Negação\"", csvComHistorico.includes(",Negação,"));
check("duração em minutos aparece formatada (\"12 min\")", csvComHistorico.includes(",12 min,"));
check("linha sem duração fica em branco (LEITURA não tem duração própria)", csvComHistorico.includes('"processo: Ação, com vírgula e ""aspas""",,'));
check("outOfBand true vira \"Sim\"", csvComHistorico.includes(",Sim\r\n"));
check("outOfBand false vira \"Não\"", csvComHistorico.includes(",Não\r\n"));
check(
  "registro afetado com vírgula e aspas é escapado (RFC 4180)",
  csvComHistorico.includes('"processo: Ação, com vírgula e ""aspas"""')
);
check("todas as 6 linhas de dado estão presentes", log.every((l) => csvComHistorico.includes(l.memberName)));
check("safeFileFragment produz nome de arquivo sem caractere especial", /^[a-z0-9-]+$/.test(safeFileFragment("Escritório Teste & Associados!")));

// ---------------------------------------------------------------------------------------------
section("2. CSV do extrato: nenhum acesso no período");
// ---------------------------------------------------------------------------------------------
const csvVazio = buildAccessLogCsv({ officeName: "Escritório Sem Acesso", days: 90, log: [], now: NOW });
check(
  "texto explícito de \"nenhum acesso\" está presente",
  csvVazio.includes("Nenhum acesso da equipe Lúmen neste período.")
);
check("não sobra uma tabela vazia (sem cabeçalho de colunas) no caso vazio", !csvVazio.includes("Data/hora,Quem"));
check("cabeçalho de identificação continua presente mesmo vazio", csvVazio.includes("Escritório: Escritório Sem Acesso"));

// ---------------------------------------------------------------------------------------------
section("3a. Prévia usa os MESMOS campos que SUPPORT_MASK_MAP declara (por model)");
// ---------------------------------------------------------------------------------------------
for (const model of PREVIEW_MODELS) {
  const { fields } = buildMaskedComparison(model, []);
  const expected = Object.keys(SUPPORT_MASK_MAP[model] ?? {});
  check(`${model}: campos da prévia == Object.keys(SUPPORT_MASK_MAP.${model})`, JSON.stringify(fields) === JSON.stringify(expected));
  check(`${model}: SUPPORT_MASK_MAP.${model} não está vazio (o teste não passaria por acidente)`, expected.length > 0);
}

// ---------------------------------------------------------------------------------------------
section("3b. Prévia produz EXATAMENTE o mesmo valor mascarado que maskReadResult() direto");
// ---------------------------------------------------------------------------------------------
const amostraCase = {
  id: "case_x",
  officeId: "off_1",
  status: "ATIVO",
  title: "Fulano vs. Banco XYZ",
  processNumber: "0001234-56.2023.8.09.0051",
  caseValue: 15000.5,
  opposingPartyName: "Banco XYZ S.A.",
  description: "Detalhe sigiloso do processo",
  createdAt: new Date("2024-01-01T00:00:00Z"),
};

// Referência independente: chama maskReadResult direto, do jeito que lib/prisma.ts chamaria numa
// leitura de verdade sob sessão de suporte.
const referenciaMascarada = maskReadResult("Case", structuredClone(amostraCase)) as Record<string, unknown>;

// A prévia, através de buildMaskedComparison — o caminho que a tela realmente usa.
const { pairs } = buildMaskedComparison("Case", [structuredClone(amostraCase)]);
const previaMascarada = pairs[0].masked;

for (const field of Object.keys(SUPPORT_MASK_MAP.Case)) {
  check(
    `Case.${field}: valor mascarado pela prévia == valor mascarado por maskReadResult() direto`,
    JSON.stringify(previaMascarada[field]) === JSON.stringify(referenciaMascarada[field])
  );
}
check("título mascarado bate com o formato esperado (freeText, comprimento preservado)", previaMascarada.title === "[conteúdo protegido — 20 caracteres]");
check("caseValue (money) desaparece (null, nunca string nem valor real)", previaMascarada.caseValue === null);
check("real permanece intocado depois de mascarar uma CÓPIA (real.title ainda é o título de verdade)", amostraCase.title === "Fulano vs. Banco XYZ");
check(
  "maskKindFor devolve o mesmo MaskKind declarado em SUPPORT_MASK_MAP para Case.title",
  maskKindFor("Case", "title") === SUPPORT_MASK_MAP.Case.title
);

// ---------------------------------------------------------------------------------------------
section("3c. Prévia e extensão de produção importam maskReadResult do MESMO módulo (mesma função em runtime)");
// ---------------------------------------------------------------------------------------------
// Checagem estrutural, no texto-fonte: garante que ninguém trocou o import de
// lib/supportPreview.ts por uma cópia local ("./maskFalso" ou similar) sem que este teste
// perceba. Não substitui 3b (que já prova pela SAÍDA), é reforço pela ORIGEM do import.
const previewSrc = fs.readFileSync(path.join(__dirname, "../lib/supportPreview.ts"), "utf8");
const prismaSrc = fs.readFileSync(path.join(__dirname, "../lib/prisma.ts"), "utf8");
const previewImportsMaskFromApply = /import\s*\{\s*maskReadResult\s*\}\s*from\s*"@\/lib\/supportMaskingApply"/.test(previewSrc);
const prismaImportsMaskFromApply = /import\s*\{\s*maskReadResult\s*\}\s*from\s*"@\/lib\/supportMaskingApply"/.test(prismaSrc);
check("lib/supportPreview.ts importa maskReadResult de @/lib/supportMaskingApply", previewImportsMaskFromApply);
check("lib/prisma.ts (extensão de produção) importa maskReadResult do MESMO caminho", prismaImportsMaskFromApply);
const previewImportsMapFromMap = /import\s*\{\s*SUPPORT_MASK_MAP\s*\}\s*from\s*"@\/lib\/supportMaskingMap"/.test(previewSrc);
check("lib/supportPreview.ts importa SUPPORT_MASK_MAP de @/lib/supportMaskingMap (mesmo mapa de produção)", previewImportsMapFromMap);

// ---------------------------------------------------------------------------------------------
console.log(`\n${"=".repeat(70)}`);
if (failures.length) {
  console.log(`FALHOU: ${failures.length} caso(s) com problema, ${passed} ok.`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log(`TUDO OK: ${passed} verificações passaram.`);
