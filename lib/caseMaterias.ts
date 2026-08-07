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
// se nenhuma. Mantém funcionando, sem precisar migrar, todo filtro/relatório/busca/badge que já
// lê `area` hoje (Processos, Relatórios, Painel, busca do widget Claude, geração de documento).
export function deriveArea(materias: string[] | undefined): string | null {
  return materias && materias.length > 0 ? materias[0] : null;
}
