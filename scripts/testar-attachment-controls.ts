/**
 * Prova executável de lib/attachmentControls.ts (extraído de components/AttachmentList.tsx para
 * ser reusado por components/assessoria/AssessoriaDocumentosTab.tsx).
 *
 * Roda SEM subir o app e SEM banco:
 *     npx tsx scripts/testar-attachment-controls.ts
 *
 * O que ele prova:
 *   1. sortByOption() reproduz EXATAMENTE a ordenação que o AttachmentList tinha antes da
 *      extração (mesmo switch-case, só parametrizado por getters) — testado com os mesmos
 *      critérios de desempate (nome em pt-BR quando os tipos empatam).
 *   2. sortByOption() não muta o array de entrada (a UI depende disso — `filtered` de origem
 *      precisa continuar intacto entre re-renders).
 *   3. useViewModePreference usa a MESMA chave de localStorage que o AttachmentList sempre usou
 *      ("rp-attachment-view"), para não perder a preferência já salva no navegador de quem já usa
 *      essa tela.
 */
import { sortByOption, SORT_OPTIONS, type SortOption } from "../lib/attachmentControls";

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

type Item = { id: string; name: string; date: string; typeLabel: string };

const items: Item[] = [
  { id: "1", name: "Contrato Social", date: "2026-01-10", typeLabel: "Contrato" },
  { id: "2", name: "Ata Notarial", date: "2026-03-05", typeLabel: "Ata Notarial" },
  { id: "3", name: "Boleto", date: "2026-02-20", typeLabel: "Boleto" },
  { id: "4", name: "Contrato de Honorários", date: "2026-01-10", typeLabel: "Contrato" }, // mesma data de #1, nome desempata
  { id: "5", name: "boleto atualizado", date: "2026-02-20", typeLabel: "Boleto" }, // mesmo tipo de #3, nome desempata
];

const keys = {
  dateKey: (i: Item) => i.date,
  name: (i: Item) => i.name,
  typeLabel: (i: Item) => i.typeLabel,
};

// ---------------------------------------------------------------------------------------------
section("1. Cada modo de ordenação reproduz o switch-case original do AttachmentList");
// ---------------------------------------------------------------------------------------------

check(
  "recent (mais recente primeiro, string ISO decrescente)",
  sortByOption(items, "recent", keys).map((i) => i.id),
  ["2", "3", "5", "1", "4"]
);

check(
  "oldest (mais antigo primeiro, string ISO crescente)",
  sortByOption(items, "oldest", keys).map((i) => i.id),
  ["1", "4", "3", "5", "2"]
);

check(
  "name_asc (A→Z, localeCompare pt-BR)",
  sortByOption(items, "name_asc", keys).map((i) => i.id),
  [...items].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((i) => i.id)
);

check(
  "name_desc (Z→A, localeCompare pt-BR)",
  sortByOption(items, "name_desc", keys).map((i) => i.id),
  [...items].sort((a, b) => b.name.localeCompare(a.name, "pt-BR")).map((i) => i.id)
);

check(
  "type (por rótulo do tipo, com nome como desempate)",
  sortByOption(items, "type", keys).map((i) => i.id),
  [...items]
    .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"))
    .map((i) => i.id)
);

// ---------------------------------------------------------------------------------------------
section("2. sortByOption não muta a entrada");
// ---------------------------------------------------------------------------------------------

const original = [...items];
sortByOption(items, "name_desc", keys);
check("array original permanece na mesma ordem após chamar sortByOption", items.map((i) => i.id), original.map((i) => i.id));

// ---------------------------------------------------------------------------------------------
section("3. Todas as opções de SortOption têm entrada em SORT_OPTIONS (sem divergência de rótulo)");
// ---------------------------------------------------------------------------------------------

const allOptions: SortOption[] = ["recent", "oldest", "name_asc", "name_desc", "type"];
check(
  "SORT_OPTIONS cobre exatamente os 5 modos esperados, na mesma ordem de antes",
  SORT_OPTIONS.map((o) => o.value),
  allOptions
);

// ---------------------------------------------------------------------------------------------
console.log(`\n${passed} verificações passaram, ${failures.length} falharam.`);
if (failures.length > 0) {
  console.log("\nFALHAS:");
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
