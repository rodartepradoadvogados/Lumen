// UMA definição de "pontos" para a Gestão inteira (Produtividade, Visão geral, Indicadores).
//
// Antes havia três leituras: o histórico somava `Task.points` das tarefas concluídas no mês, o
// painel de Relatórios somava a mesma coisa em outra janela, e o Personalizado creditava por
// "quem anexou/concluiu". Aqui fica só a regra e o texto: pontos = `Task.points` das tarefas
// CONCLUÍDAS, no período, creditados ao RESPONSÁVEL. `Task.points` é gravado quando a tarefa é
// criada (tabela `TaskTypePoints` do escritório, ou pontuação própria de um passo de workflow).

export const TIPOS_DE_TAREFA = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"] as const;
export const PONTOS_PADRAO_DO_TIPO = 10;

const ROTULO: Record<string, string> = {
  TAREFA: "Tarefa",
  EVENTO: "Evento",
  AUDIENCIA: "Audiência",
  PERICIA: "Perícia",
  PRAZO: "Prazo",
};

export type TarefaConcluida = { responsibleId: string | null; points: number };

/** Soma de pontos por responsável. Tarefa sem responsável não pontua ninguém e não entra. */
export function pontosPorPessoa(tarefas: TarefaConcluida[]): Map<string, { pontos: number; tarefas: number }> {
  const mapa = new Map<string, { pontos: number; tarefas: number }>();
  for (const t of tarefas) {
    if (!t.responsibleId) continue;
    const atual = mapa.get(t.responsibleId) ?? { pontos: 0, tarefas: 0 };
    atual.pontos += t.points;
    atual.tarefas += 1;
    mapa.set(t.responsibleId, atual);
  }
  return mapa;
}

/** A tabela "Tarefa 10 · Evento 10 · ..." lida de `TaskTypePoints` (o padrão vale onde não há linha). */
export function tabelaDePontos(linhas: { type: string; points: number }[]): string[] {
  return TIPOS_DE_TAREFA.map((tipo) => `${ROTULO[tipo]} ${linhas.find((l) => l.type === tipo)?.points ?? PONTOS_PADRAO_DO_TIPO}`);
}

/** A frase de "Como se calcula", a mesma em todas as telas. */
export function comoSeCalculamOsPontos(linhas: { type: string; points: number }[]): string {
  return `Cada tarefa concluída vale os pontos do seu tipo (${tabelaDePontos(linhas).join(" · ")}), definidos quando a tarefa é criada, e conta para o responsável. Tarefas de fluxos podem ter pontuação própria.`;
}
