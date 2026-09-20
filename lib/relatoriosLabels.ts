// Rótulos e cores compartilhados entre o BI consolidado do desktop (app/(app)/relatorios/page.tsx)
// e o resumo mobile (app/m/relatorios/page.tsx) — antes cada tela tinha a própria cópia, e elas
// divergiram silenciosamente: o mobile chegou a pintar ARQUIVADO de vermelho (--urgente), que o
// desktop reserva para dado vencido/KPI negativo (DESIGN-SYSTEM.md §2), enquanto o comentário do
// mobile afirmava "mesmo mapa" (achado A47 da revisão gauntlet). Um módulo só, importado nas duas
// telas, elimina a possibilidade de voltarem a divergir.

// OS ESTÁGIOS VÊM DE lib/funil.ts, e não de uma cópia aqui. Havia duas listas — esta e a da
// Triagem — e a diferença entre elas só apareceria quando um estágio novo sumisse de um relatório
// sem erro nenhum. O relatório e a tela têm de contar a mesma história.
export { stageOptions as STAGES, stageLabels, stageDot as stageColor } from "@/lib/funil";

export const CASE_STATUS_ORDER = ["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"];
export const caseStatusLabels: Record<string, string> = {
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  ENCERRADO: "Encerrado",
  ARQUIVADO: "Arquivado",
};
// ARQUIVADO usa o mesmo neutro de ENCERRADO — --urgente é reservado para dado vencido/KPI
// negativo (DESIGN-SYSTEM.md §2), e arquivar é encerramento deliberado, não isso.
export const caseStatusColor: Record<string, string> = {
  ATIVO: "var(--concluido)",
  SUSPENSO: "var(--aviso)",
  ENCERRADO: "var(--tx-3)",
  ARQUIVADO: "var(--tx-3)",
};

export const triageLabels: Record<string, string> = { PENDENTE: "Pendente", EM_ANALISE: "Em análise", TRATADA: "Tratada" };
export const triageColor: Record<string, string> = { PENDENTE: "var(--aviso)", EM_ANALISE: "var(--acao)", TRATADA: "var(--concluido)" };
