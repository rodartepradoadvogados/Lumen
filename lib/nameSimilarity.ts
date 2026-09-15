// Similaridade de nomes de arquivo — decide se um documento novo, encontrado solto no Drive, é
// provavelmente a MESMA petição/contrato/etc. de um anexo cujo arquivo sumiu (ex.:
// "2026_09_08_CONTRATO.pdf" → "2026_09_15_CONTRATO.pdf", só a data mudou) ou se é um documento
// genuinamente diferente. Usado por lib/actions/attachmentReconciliation.ts.
//
// Mesma ideia (e o MESMO corte de 60%) já usada em pareceMesmoCaso
// (lib/actions/driveFolderMigration.ts, script de migração de pastas legadas) para comparar nomes
// de PASTA por sobreposição de palavras — generalizado aqui para nome de ARQUIVO, exportado para
// reúso em vez de duplicado ali.
export const SIMILARITY_THRESHOLD = 60;

// Quebra em tokens: remove acento/caixa, tira a extensão do arquivo (".pdf", ".docx"...) e separa
// por qualquer caractere que não seja letra/número — "2026_09_08_CONTRATO.pdf" vira
// ["2026","09","08","contrato"]. Números curtos (dia/mês) contam como token igual a qualquer
// palavra: são exatamente o que muda entre duas versões do mesmo documento.
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Fração de tokens em comum sobre o MENOR dos dois conjuntos (0-100) — "2026_09_08_CONTRATO" vs
// "2026_09_15_CONTRATO" compartilha {2026, 09, contrato} de 4 tokens = 75%; trocando também o mês
// ({2026, contrato} de 5) cai para 60%, exatamente no limite. Ordem dos nomes não importa.
export function similarity(a: string, b: string): number {
  const ta = [...new Set(tokenize(a))];
  const tb = new Set(tokenize(b));
  if (!ta.length || !tb.size) return 0;
  const shared = ta.filter((t) => tb.has(t)).length;
  return Math.round((shared / Math.min(ta.length, tb.size)) * 100);
}
