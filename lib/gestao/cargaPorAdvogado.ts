import { prisma } from "@/lib/prisma";
import { hojeCalendario } from "@/lib/gestao/dias";
import { STATUS_ABERTOS, agregarCarga, type LinhaDeCarga } from "@/lib/gestao/cargaCalculo";

// A conta pura mora em cargaCalculo.ts (sem prisma): o componente de cliente da tabela ordenável
// também a importa, e um módulo com prisma não pode ir para o navegador.
export { STATUS_ABERTOS, agregarCarga, ordenarCarga, type LinhaDeCarga, type TarefaParaCarga } from "@/lib/gestao/cargaCalculo";
import { inicioDoMesEmBrasilia, inicioDoProximoMesEmBrasilia } from "@/lib/horaDeBrasilia";

// CARGA POR PESSOA — "quem está com o quê, e o que está pegando fogo".
//
// Definições (a mesma régua em toda tela da Gestão):
//   abertas        tarefas com status PENDENTE ou EM_ANDAMENTO, de qualquer tipo, com responsável
//   vencem em 7    abertas cujo prazo cai de hoje até hoje + 7 dias corridos
//   atrasadas      abertas cujo prazo é anterior a hoje (dia de calendário do escritório)
//   sem triagem    publicações com triageStatus PENDENTE atribuídas à pessoa
//   feitas no mês  tarefas CONCLUIDAS no mês corrente (Brasília) em que a pessoa é o responsável
//
// Tarefa e prazo entram juntos (`type` não filtra): quem olha a carga quer ver tudo o que a pessoa
// tem aberto, e o tipo PRAZO já é o mais grave dentro do conjunto.

export type CargaDoEscritorio = {
  linhas: LinhaDeCarga[];
  totais: { abertas: number; vencemEm7: number; atrasadas: number; semTriagem: number; feitasNoMes: number };
  /** Tarefas abertas sem responsável — carga que ninguém carrega. */
  abertasSemResponsavel: number;
  /** Publicações sem triagem que ninguém pegou (assignedToId nulo). */
  publicacoesSemDono: number;
};

/**
 * `somenteUserId`: quem não é sócio vê só a própria linha (decisão da Gestão, reversível: carga da
 * equipe inteira é informação de gestão; o advogado continua vendo a própria carga).
 */
export async function cargaPorAdvogado(officeId: string, opts: { agora?: Date; somenteUserId?: string } = {}): Promise<CargaDoEscritorio> {
  const agora = opts.agora ?? new Date();
  const hoje = hojeCalendario(agora);
  const inicioMes = inicioDoMesEmBrasilia(agora);
  const fimMes = inicioDoProximoMesEmBrasilia(agora);

  const [pessoas, abertas, pubs, concluidas, semResp] = await Promise.all([
    prisma.user.findMany({
      where: { officeId, active: true, ...(opts.somenteUserId ? { id: opts.somenteUserId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: { officeId, status: { in: STATUS_ABERTOS }, responsibleId: { not: null } },
      select: { responsibleId: true, status: true, dueDate: true },
    }),
    prisma.publication.findMany({ where: { officeId, triageStatus: "PENDENTE" }, select: { assignedToId: true } }),
    prisma.task.findMany({
      where: { officeId, status: "CONCLUIDO", completedAt: { gte: inicioMes, lt: fimMes }, responsibleId: { not: null } },
      select: { responsibleId: true },
    }),
    prisma.task.count({ where: { officeId, status: { in: STATUS_ABERTOS }, responsibleId: null } }),
  ]);

  const linhas = agregarCarga({ pessoas, abertas, publicacoesSemTriagem: pubs, concluidasNoMes: concluidas, hoje });
  const soma = (k: keyof Omit<LinhaDeCarga, "userId" | "nome">) => linhas.reduce((s, l) => s + l[k], 0);
  return {
    linhas,
    totais: {
      abertas: soma("abertas"),
      vencemEm7: soma("vencemEm7"),
      atrasadas: soma("atrasadas"),
      semTriagem: opts.somenteUserId ? soma("semTriagem") : pubs.length,
      feitasNoMes: soma("feitasNoMes"),
    },
    abertasSemResponsavel: semResp,
    publicacoesSemDono: pubs.filter((p) => !p.assignedToId).length,
  };
}

