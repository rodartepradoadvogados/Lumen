// Prova executável de lib/financeReceiptNaming.ts — formato do nome do comprovante de
// pagamento/recebimento (Financeiro), pedido explícito: "AAAA-MM-DD-[fornecedor]-[descricao]".
// Não precisa de banco (função pura). Rodar: npx tsx scripts/testar-nomeacao-comprovante.ts

import { buildReceiptFileName, extensionFromFileName } from "../lib/financeReceiptNaming";

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

console.log("\n1. Formato básico");
const r1 = buildReceiptFileName({ date: "2026-08-06T12:00:00.000Z", counterpart: "Papelaria Central", description: "Material de escritório", extension: "pdf" });
check("data-fornecedor-descricao.pdf", r1 === "2026-08-06-papelaria-central-material-de-escritorio.pdf");

console.log("\n2. Acento, maiúscula e pontuação no fornecedor/descrição são normalizados");
const r2 = buildReceiptFileName({ date: "2026-08-06", counterpart: "José & Cia. Ltda", description: "Honorários — 1ª parcela (R$ 500,00)", extension: "PDF" });
check("sem acento", !/[áéíóúâêôãõç]/i.test(r2));
check("sem maiúscula", r2 === r2.toLowerCase());
// Só o nome, sem a extensão — senão o "." legítimo antes de "pdf" seria acusado como pontuação solta.
check("sem espaço nem pontuação solta", !/[\s.,&()ª$]/.test(r2.replace(/\.pdf$/, "")));
check("extensão vira minúscula", r2.endsWith(".pdf"));

console.log("\n3. Fornecedor/pagador ausente não quebra o nome");
const r3 = buildReceiptFileName({ date: "2026-08-06", counterpart: null, description: "Taxa judiciária", extension: "jpg" });
check("cai para 'sem-informacao' no lugar do fornecedor", r3 === "2026-08-06-sem-informacao-taxa-judiciaria.jpg");

console.log("\n4. Data usa os componentes UTC, não o fuso de Brasília");
// paidDate/dueDate nascem de <input type="date"> ("AAAA-MM-DD", sem hora) e são gravados como
// `new Date(string)` — o construtor interpreta string só-data como meia-noite UTC. Se o nome do
// arquivo reformatasse isso em America/Sao_Paulo (UTC-3), meia-noite UTC de "2026-08-06" viraria
// 21h do dia 5 em Brasília, e o comprovante sairia catalogado um dia ANTES do que o usuário
// escolheu — exatamente o bug que este teste trava.
const r4 = buildReceiptFileName({ date: "2026-08-06", counterpart: "Fulano", description: "Teste", extension: "pdf" });
check("meia-noite UTC de 06/08 permanece 06/08 no nome (não recua para 05/08)", r4.startsWith("2026-08-06-"));

console.log("\n5. Sem extensão informada cai em pdf");
const r5 = buildReceiptFileName({ date: "2026-08-06", counterpart: "Fulano", description: "Teste", extension: "" });
check("extensão vazia vira pdf", r5.endsWith(".pdf"));

console.log("\n6. extensionFromFileName");
check('"comprovante.pdf" -> "pdf"', extensionFromFileName("comprovante.pdf") === "pdf");
check('"nota fiscal.docx" -> "docx"', extensionFromFileName("nota fiscal.docx") === "docx");
check('"semextensao" -> "pdf" (sem ponto nenhum)', extensionFromFileName("semextensao") === "pdf");
check('"arquivo.tar.gz" -> "gz" (última extensão)', extensionFromFileName("arquivo.tar.gz") === "gz");

console.log("\n7. Descrição/fornecedor muito longos são cortados (nome de arquivo não pode ficar absurdo)");
const nomeLongo = "a".repeat(200);
const r7 = buildReceiptFileName({ date: "2026-08-06", counterpart: nomeLongo, description: nomeLongo, extension: "pdf" });
check("nome final tem tamanho razoável (< 200 chars)", r7.length < 200);

console.log(`\n${ok} verificações OK, ${falhas} falha(s).\n`);
if (falhas > 0) process.exit(1);
