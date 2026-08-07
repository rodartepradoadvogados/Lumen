// Lista única de matérias — antes duplicada em app/(app)/processos/novo/page.tsx e
// components/mobile/MobileNewCaseForm.tsx (cada um com sua própria cópia de AREA_OPTIONS).
// Centralizada aqui para virar multi-seleção (Case.materias) sem manter duas listas em sincronia.
export const MATERIA_OPTIONS = [
  "Cível",
  "Trabalhista",
  "Tributário",
  "Família",
  "Sucessões",
  "Criminal",
  "Previdenciário",
  "Empresarial",
  "Consumidor",
  "Administrativo",
  "Outra",
];

// Deriva o Case.area legado a partir da lista de matérias — sempre a primeira escolhida, ou null
// se nenhuma. `area` continua sendo escrito por compatibilidade (registros antigos/scripts
// externos que ainda leiam essa coluna), mas Processos/Relatórios/Painel/busca do widget
// Claude/geração de documento já leem `materias` diretamente (ver funções abaixo).
export function deriveArea(materias: string[] | undefined): string | null {
  return materias && materias.length > 0 ? materias[0] : null;
}

// Texto corrido para prosa de documentos ("relativo a matéria de X") — junta com vírgula e um
// "e" antes do último item ("Cível, Trabalhista e Tributário"). Cai para o `area` legado quando
// o processo ainda não tem `materias` preenchido (registro anterior a esta funcionalidade e nunca
// reeditado — o backfill em scripts/backfill-case-materias.ts cobre a imensa maioria dos casos,
// isto é só uma rede de segurança).
export function materiaDisplay(materias: string[] | undefined, fallbackArea?: string | null): string | null {
  const list = (materias || []).filter(Boolean);
  if (list.length === 0) return fallbackArea || null;
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

// Agrupa processos por matéria para os cards de Relatórios/Painel — um processo com mais de uma
// matéria conta em cada grupo (multi-seleção, ao contrário do antigo `area` único), por isso a
// soma dos grupos pode passar do total de processos. Sem nenhuma matéria cai em "Sem matéria".
export function groupCasesByMateria(cases: { materias: string[] }[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cases) {
    const materias = c.materias.filter(Boolean).length > 0 ? c.materias.filter(Boolean) : ["Sem matéria"];
    for (const m of materias) counts.set(m, (counts.get(m) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// Usado pela ferramenta consultar_processos do widget Claude (lib/assistantTools.ts): já que
// Prisma não faz "contains" case-insensitive em coluna String[], o filtro por matéria é feito em
// memória sobre um lote de candidatos já restrito por cliente/status.
export function caseMatchesMateria(materias: string[], area: string | null | undefined, query: string): boolean {
  const q = query.toLowerCase();
  if (materias.some((m) => m.toLowerCase().includes(q))) return true;
  return Boolean(area && area.toLowerCase().includes(q));
}
