// Rótulos e cores compartilhados entre o BI consolidado do desktop (app/(app)/relatorios/page.tsx)
// e o resumo mobile (app/m/relatorios/page.tsx) — antes cada tela tinha a própria cópia, e elas
// divergiram silenciosamente: o mobile chegou a pintar ARQUIVADO de vermelho (--urgente), que o
// desktop reserva para dado vencido/KPI negativo (DESIGN-SYSTEM.md §2), enquanto o comentário do
// mobile afirmava "mesmo mapa" (achado A47 da revisão gauntlet). Um módulo só, importado nas duas
// telas, elimina a possibilidade de voltarem a divergir.

export const STAGES = ["NOVO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];
export const stageLabels: Record<string, string> = {
  NOVO: "Novo",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};
// Remapeado por significado, não por posição: Novo = neutro (ainda sem opinião), Qualificação =
// --acao (em andamento), Proposta = --aviso (aguardando decisão do cliente), Fechado =
// --concluido, Perdido = --urgente (KPI negativo, DESIGN-SYSTEM.md §2).
export const stageColor: Record<string, string> = {
  NOVO: "var(--tx-3)",
  QUALIFICACAO: "var(--acao)",
  PROPOSTA: "var(--aviso)",
  FECHADO: "var(--concluido)",
  PERDIDO: "var(--urgente)",
};

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
