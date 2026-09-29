import { prisma } from "@/lib/prisma";
import { hojeCalendario, situacaoDoPrazo } from "@/lib/gestao/dias";
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

export const STATUS_ABERTOS = ["PENDENTE", "EM_ANDAMENTO"];

export type TarefaParaCarga = { responsibleId: string | null; status: string; dueDate: Date };

export type LinhaDeCarga = {
  userId: string;
  nome: string;
  abertas: number;
  vencemEm7: number;
  atrasadas: number;
  semTriagem: number;
  feitasNoMes: number;
};

export function agregarCarga(params: {
  pessoas: { id: string; name: string }[];
  abertas: TarefaParaCarga[];
  publicacoesSemTriagem: { assignedToId: string | null }[];
  concluidasNoMes: { responsibleId: string | null }[];
  hoje: Date;
  janelaEmDias?: number;
}): LinhaDeCarga[] {
  const { pessoas, abertas, publicacoesSemTriagem, concluidasNoMes, hoje, janelaEmDias = 7 } = params;
  const linhas = new Map<string, LinhaDeCarga>();
  for (const p of pessoas) {
    linhas.set(p.id, { userId: p.id, nome: p.name, abertas: 0, vencemEm7: 0, atrasadas: 0, semTriagem: 0, feitasNoMes: 0 });
  }
  for (const t of abertas) {
    if (!t.responsibleId || !STATUS_ABERTOS.includes(t.status)) continue;
    const l = linhas.get(t.responsibleId);
    if (!l) continue;
    l.abertas += 1;
    const s = situacaoDoPrazo(t.dueDate, hoje, janelaEmDias);
    if (s === "atrasado") l.atrasadas += 1;
    else if (s === "vence-na-janela") l.vencemEm7 += 1;
  }
  for (const p of publicacoesSemTriagem) {
    if (!p.assignedToId) continue;
    const l = linhas.get(p.assignedToId);
    if (l) l.semTriagem += 1;
  }
  for (const c of concluidasNoMes) {
    if (!c.responsibleId) continue;
    const l = linhas.get(c.responsibleId);
    if (l) l.feitasNoMes += 1;
  }
  return Array.from(linhas.values());
}

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

/** Ordena as linhas por uma coluna (maior primeiro), desempatando pelas atrasadas. */
export function ordenarCarga(linhas: LinhaDeCarga[], chave: keyof Omit<LinhaDeCarga, "userId" | "nome">): LinhaDeCarga[] {
  return [...linhas].sort((a, b) => b[chave] - a[chave] || b.atrasadas - a.atrasadas || a.nome.localeCompare(b.nome, "pt-BR"));
}
