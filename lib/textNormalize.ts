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
