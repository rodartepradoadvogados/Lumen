// Helper central da taxonomia do setor administrativo (ver decisão do dono do escritório):
// todo "processo" (tem número e tramita em órgão) é JUDICIAL (Poder Judiciário) ou
// ADMINISTRATIVO (tribunal de contas, contencioso tributário, licitação, SEI...); qualquer outra
// coisa cadastrada em Case (Caso extrajudicial, e os legados ATENDIMENTO/CONSULTIVO que
// continuam existindo no banco, sem migração) é agrupada como "CASO" para fins de navegação —
// nunca aparece como opção de cadastro, só como resultado de leitura do que já existe.
export type CaseNatureza = "JUDICIAL" | "ADMINISTRATIVO" | "CASO";

// Deriva a natureza a partir do Case.type bruto gravado no banco. Qualquer valor que não seja
// exatamente "JUDICIAL" ou "ADMINISTRATIVO" — incluindo null/undefined, "EXTRAJUDICIAL" e os
// legados "ATENDIMENTO"/"CONSULTIVO" — cai em "CASO". Isso preserva 100% dos dados existentes
// sem precisar de migração: um Case antigo continua com o mesmo Case.type de sempre, só passa a
// ser classificado como "CASO" nesta camada de leitura.
export function naturezaOf(type: string | null | undefined): CaseNatureza {
  if (type === "JUDICIAL") return "JUDICIAL";
  if (type === "ADMINISTRATIVO") return "ADMINISTRATIVO";
  return "CASO";
}

export const NATUREZA_LABELS: Record<CaseNatureza, string> = {
  JUDICIAL: "Judicial",
  ADMINISTRATIVO: "Administrativo",
  CASO: "Caso",
};

// Fragmento de where do Prisma equivalente a uma natureza — usado pelas listagens (abas
// Judicial/Administrativo/Casos) pra filtrar sem duplicar essa lógica em cada página. Tipado
// como `object` genérico (em vez de Prisma.CaseWhereInput) pra este arquivo não precisar
// importar @prisma/client só por causa do tipo — quem consome mescla o retorno dentro do próprio
// where do findMany (que aí sim é tipado por Prisma), então o `as` fica só do lado de quem chama.
export function naturezaWhere(natureza: CaseNatureza): object {
  if (natureza === "JUDICIAL") return { type: "JUDICIAL" };
  if (natureza === "ADMINISTRATIVO") return { type: "ADMINISTRATIVO" };
  return { type: { notIn: ["JUDICIAL", "ADMINISTRATIVO"] } };
}

// Lê o parâmetro de querystring (?natureza=judicial|administrativo|caso, sempre minúsculo por
// vir de URL) e devolve a CaseNatureza correspondente, ou null quando o valor não bate com
// nenhuma opção conhecida (inclui undefined) — null significa "sem filtro, mostrar todos".
export function parseNaturezaParam(v: string | undefined): CaseNatureza | null {
  if (v === "judicial") return "JUDICIAL";
  if (v === "administrativo") return "ADMINISTRATIVO";
  if (v === "caso") return "CASO";
  return null;
}

// Esferas de governo do processo administrativo — usado no formulário de cadastro (select) e
// como legenda de filtro na listagem.
export const ESFERAS: { value: string; label: string }[] = [
  { value: "FEDERAL", label: "Federal" },
  { value: "ESTADUAL", label: "Estadual" },
  { value: "MUNICIPAL", label: "Municipal" },
];

// Matérias do processo administrativo — cobre os núcleos de atuação hoje previstos (contas
// públicas, tributário, licitações, disciplinar, regulatório, ambiental, previdenciário) mais um
// "Outro" de escape pra não travar cadastro de algo fora da lista.
export const MATERIAS_ADMIN: { value: string; label: string }[] = [
  { value: "CONTAS", label: "Contas Públicas" },
  { value: "TRIBUTARIO", label: "Tributário" },
  { value: "LICITACAO", label: "Licitações e Contratos" },
  { value: "DISCIPLINAR", label: "Disciplinar" },
  { value: "REGULATORIO", label: "Regulatório" },
  { value: "AMBIENTAL", label: "Ambiental" },
  { value: "PREVIDENCIARIO", label: "Previdenciário" },
  { value: "OUTRO", label: "Outro" },
];

export const ESFERA_LABELS: Record<string, string> = Object.fromEntries(ESFERAS.map((e) => [e.value, e.label]));

export const MATERIA_LABELS: Record<string, string> = Object.fromEntries(MATERIAS_ADMIN.map((m) => [m.value, m.label]));
