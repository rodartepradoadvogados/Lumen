// Vocabulário do funil comercial (Atendimento) — estágios e rótulos.
//
// Mora AQUI, num módulo comum, e não dentro de components/FunnelStageSelect.tsx, por um motivo
// concreto: aquele arquivo é "use client", e a página do Funil (app/(app)/atendimento/funil/
// page.tsx) é Server Component. Importar um export que NÃO é componente através dessa fronteira
// quebra em produção — o bundler do React não acha o módulo no Client Manifest e a rota devolve
// 500 ("Could not find the module ...#stageLabels#NOVO in the React Client Manifest"), erro que
// só aparece no servidor de produção, nunca no build nem em desenvolvimento.
//
// Regra prática que fica registrada: constante compartilhada entre server e client component vai
// para um módulo neutro como este, nunca exportada de um arquivo "use client".

export const stageOptions = ["NOVO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];

export const stageLabels: Record<string, string> = {
  NOVO: "Novo",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};
