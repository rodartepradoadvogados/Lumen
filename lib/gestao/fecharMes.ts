import { prisma } from "@/lib/prisma";

// "FECHAR O MÊS" — três contagens simples do que costuma ficar para trás na virada. Sem dado novo:
// cada número é uma consulta direta, e cada linha aponta para a tela onde se resolve.

export type ItemDeFechamento = { chave: "publicacoes" | "tarefas" | "lancamentos"; quantidade: number; rotulo: string; href: string };

export function montarFechamento(c: { publicacoesSemTriagem: number; tarefasSemResponsavel: number; lancamentosSemCategoria: number | null }): ItemDeFechamento[] {
  const itens: ItemDeFechamento[] = [
    { chave: "publicacoes", quantidade: c.publicacoesSemTriagem, rotulo: c.publicacoesSemTriagem === 1 ? "publicação sem triagem" : "publicações sem triagem", href: "/publicacoes" },
    { chave: "tarefas", quantidade: c.tarefasSemResponsavel, rotulo: c.tarefasSemResponsavel === 1 ? "tarefa sem responsável" : "tarefas sem responsável", href: "/agenda" },
  ];
  if (c.lancamentosSemCategoria !== null) {
    itens.push({
      chave: "lancamentos",
      quantidade: c.lancamentosSemCategoria,
      rotulo: c.lancamentosSemCategoria === 1 ? "lançamento sem categoria" : "lançamentos sem categoria",
      href: "/financeiro/despesas",
    });
  }
  return itens;
}

export async function fecharOMes(officeId: string, verFinanceiro: boolean) {
  const [semTriagem, semResponsavel, recSem, pagSem] = await Promise.all([
    prisma.publication.count({ where: { officeId, triageStatus: "PENDENTE" } }),
    prisma.task.count({ where: { officeId, status: { in: ["PENDENTE", "EM_ANDAMENTO"] }, responsibleId: null } }),
    verFinanceiro ? prisma.receivable.count({ where: { officeId, categoryId: null, status: { notIn: ["CANCELADO", "A_APURAR"] } } }) : Promise.resolve(null),
    verFinanceiro ? prisma.payable.count({ where: { officeId, categoryId: null, status: { not: "CANCELADO" } } }) : Promise.resolve(null),
  ]);
  return montarFechamento({
    publicacoesSemTriagem: semTriagem,
    tarefasSemResponsavel: semResponsavel,
    lancamentosSemCategoria: recSem === null || pagSem === null ? null : recSem + pagSem,
  });
}
