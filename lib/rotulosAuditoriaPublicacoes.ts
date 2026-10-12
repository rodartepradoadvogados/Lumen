// Rótulos das ações da trilha de publicações. PURO e sem Prisma: a tela da trilha (componente de
// cliente) importa daqui; lib/auditoriaPublicacoes.ts (servidor, com Prisma) não pode ir para o navegador.

const ROTULOS = {
  VISTA: "marcou como vista (só para ela/ele)",
  VISTA_DESFEITA: "desfez o visto",
  VISTA_EM_LOTE: "marcou várias como vistas",
  TRATAR_PRAZO: "registrou um prazo",
  TRATAR_TAREFA: "criou uma tarefa",
  DELEGAR: "delegou para outra pessoa",
  ATRIBUIR: "atribuiu responsável",
  CONCLUIR_PARA_TODOS: "concluiu para todos",
  DESCARTAR: "descartou",
  VINCULAR: "vinculou a um processo",
  BLOQUEAR_PROCESSO: "bloqueou o processo",
  DESBLOQUEAR_PROCESSO: "desbloqueou o processo",
  DESFAZER: "desfez a última ação",
  PROMOVER: "promoveu da quarentena para a fila",
  DESCARTAR_QUARENTENA: "descartou da quarentena",
  BLOQUEAR_REMETENTE: "bloqueou o remetente",
  PERMITIR_REMETENTE: "permitiu o remetente",
  REABRIR: "reabriu",
} as const;

export type AcaoDePublicacao = keyof typeof ROTULOS;
export const ROTULO_DA_ACAO: Record<AcaoDePublicacao, string> = ROTULOS;
