// Vocabulário do funil comercial (Atendimento) — estágios, rótulos e cores.
//
// Mora AQUI, num módulo comum, e não dentro de components/FunnelStageSelect.tsx, por um motivo
// concreto: aquele arquivo é "use client", e a página da Triagem (app/(app)/atendimento/funil/
// page.tsx) é Server Component. Importar um export que NÃO é componente através dessa fronteira
// quebra em produção — o bundler do React não acha o módulo no Client Manifest e a rota devolve
// 500 ("Could not find the module ...#stageLabels#NOVO in the React Client Manifest"), erro que
// só aparece no servidor de produção, nunca no build nem em desenvolvimento.
//
// Regra prática que fica registrada: constante compartilhada entre server e client component vai
// para um módulo neutro como este, nunca exportada de um arquivo "use client".
//
// E A LISTA É UMA SÓ. Ela estava copiada em três arquivos (a página, os relatórios e o seletor).
// Acrescentar um estágio exigia lembrar dos três, e esquecer de um significa um estágio que existe
// no banco e não aparece na tela — sem erro nenhum, só sumindo. O teste em lib/testes/funil.teste.ts
// impede a volta da cópia.

// ============================================================================
// "AGUARDANDO" (COLUNA) NÃO É "ESPERANDO RESPOSTA" (BOLINHA). São duas coisas parecidas e
// diferentes, e confundi-las faria a tela mentir nos dois sentidos:
//
//   AGUARDANDO é ESTÁGIO — alguém (ou o relógio) PÔS o atendimento ali para chamar a atenção do
//   advogado ou da recepção. É uma decisão, fica gravada em Attendance.stage, e só sai de lá
//   quando alguém a tira. Um lead pode estar em Aguardando com tudo respondido.
//
//   ESPERANDO RESPOSTA é FATO — a última mensagem da conversa é do cliente e ninguém respondeu.
//   Não é escolhido por ninguém, é calculado (lib/rotulosDaEspera.ts), e some sozinho assim que
//   alguém responde. Um lead pode estar esperando resposta em QUALQUER coluna, inclusive em
//   Fechado.
//
// A tela mostra o estágio pela COLUNA e o fato pela BOLINHA QUE PISCA. Os dois juntos numa mesma
// marca fariam "movi o card" parecer "respondi o cliente".
// ============================================================================

export const stageOptions = ["NOVO", "AGUARDANDO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"];

export const stageLabels: Record<string, string> = {
  NOVO: "Novo",
  AGUARDANDO: "Aguardando",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

/**
 * A cor do ponto no cabeçalho de cada coluna.
 *
 * Remapeada por SIGNIFICADO, não por posição: Novo é neutro (ainda sem opinião), Aguardando é
 * aviso (alguém precisa olhar), Qualificação é a cor de ação (em andamento), Proposta aguarda
 * decisão do cliente, Fechado concluiu, Perdido é urgente.
 *
 * Nenhum hex cravado aqui — só variável CSS (DESIGN-SYSTEM.md §0/§16).
 */
export const stageDot: Record<string, string> = {
  NOVO: "var(--tx-3)",
  AGUARDANDO: "var(--aviso)",
  QUALIFICACAO: "var(--acao)",
  PROPOSTA: "var(--fonte-pje)",
  FECHADO: "var(--concluido)",
  PERDIDO: "var(--urgente)",
};

/**
 * O estágio para onde o atendimento cai sozinho quando o relógio de quinze minutos estoura.
 *
 * É o motivo de a coluna existir: o lead que ninguém respondeu no prazo precisa parar de ser um
 * número numa fila e virar um card que alguém vê ao abrir a tela. Continua sendo movível à mão —
 * a queda automática é um empurrão, não uma prisão.
 */
export const ESTAGIO_DE_ESPERA = "AGUARDANDO";

/** Os dois estágios que já decidiram o desfecho — não é lugar de cair sozinho. */
export const ESTAGIOS_DECIDIDOS = ["FECHADO", "PERDIDO"];

/**
 * O atendimento pode ser empurrado para "Aguardando" pelo relógio?
 *
 * Não, quando já foi decidido: um lead FECHADO que recebe uma mensagem tardia não volta a pedir
 * atenção comercial — o relógio da conversa continua valendo, mas o funil já acabou para ele.
 */
export function podeCairEmAguardando(stage: string): boolean {
  return !ESTAGIOS_DECIDIDOS.includes(stage) && stage !== ESTAGIO_DE_ESPERA;
}
