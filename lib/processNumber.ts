// Normaliza um número de processo (ou qualquer texto digitado como busca por número) removendo
// tudo que não for letra/dígito e baixando a caixa — assim "5027823-91.2026.8.09.0011" e
// "50278239120268090011" ficam idênticos pra fins de comparação. Usado em toda busca por nº de
// processo do site (busca global, listagens, modais de vincular), já que o valor é sempre salvo
// com a máscara original (pontos, hífen, barra) e o usuário pode digitar sem ela.
export function normalizeProcessNumber(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Compara um valor armazenado (nº de processo) com um termo de busca já normalizado ou cru.
export function processNumberIncludes(stored: string | null | undefined, rawQuery: string): boolean {
  if (!stored) return false;
  const normalizedQuery = normalizeProcessNumber(rawQuery);
  if (!normalizedQuery) return false;
  return normalizeProcessNumber(stored).includes(normalizedQuery);
}
