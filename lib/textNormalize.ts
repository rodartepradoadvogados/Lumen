// Normalização de texto para comparação tolerante (sem acento, sem caixa, sem espaços duplicados
// ou nas pontas) — compartilhada por qualquer comparação de nome digitado pelo usuário contra um
// nome já cadastrado (ex.: checagem de conflito de interesses, lib/actions/attendance.ts). Não
// reaproveita normalizeForCompare de lib/driveSync.ts de propósito: aquela é privada do módulo e
// pensada para nome de pasta, um assunto totalmente diferente.
const DIACRITICS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Normalização "solta" para busca por trecho (contains) tolerante a acento, caixa e qualquer
// pontuação (hífen, ponto, barra, espaço...) — mesma ideia de lib/processNumber.ts
// (normalizeProcessNumber), só que aplicada a texto qualquer (nome de parte/cliente), não só
// dígitos: primeiro tira acento (NFD + remove diacríticos), depois derruba tudo que não for
// letra/dígito. Assim "jose-carlos", "jose.carlos" e "Jose  Carlos" viram todos "josecarlos",
// batendo com "José Carlos" buscado sem acento nem pontuação.
export function normalizeLoose(s: string): string {
  return s
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Compara um valor armazenado (nome de cliente, parte, assunto...) com um termo de busca digitado
// pelo usuário, ignorando acento/caixa/pontuação dos dois lados. Espelha processNumberIncludes,
// mas para texto livre em vez de número de processo.
export function looseIncludes(stored: string | null | undefined, rawQuery: string): boolean {
  if (!stored) return false;
  const normalizedQuery = normalizeLoose(rawQuery);
  if (!normalizedQuery) return false;
  return normalizeLoose(stored).includes(normalizedQuery);
}
