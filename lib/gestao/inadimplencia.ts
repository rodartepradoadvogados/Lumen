import { prisma } from "@/lib/prisma";
import { saldoEmAberto } from "@/lib/financeCalc";
import { diasEntre, hojeCalendario } from "@/lib/gestao/dias";

// INADIMPLÊNCIA POR CLIENTE — a mesma conta de Relatórios > Financeiro (contas a receber com
// status PENDENTE, ATRASADO ou PARCIAL, com vencimento e anterior a hoje, somando o SALDO em
// aberto e não o valor cheio), agora agrupada por quem deve.
//
// Só quem tem acesso ao Financeiro pode pedir isto (a checagem é de quem chama — ver
// app/(app)/indicadores/page.tsx —, mas a função também exige `permitido` para não vazar valor por
// engano).

export type ContaVencida = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  payerName: string | null;
  dueDate: Date;
  saldo: number;
};

export type DevedorAgrupado = { chave: string; nome: string; contas: number; saldo: number; diasDeAtraso: number };

export function agruparInadimplencia(contas: ContaVencida[], hoje: Date): { total: number; contas: number; devedores: DevedorAgrupado[] } {
  const mapa = new Map<string, DevedorAgrupado>();
  for (const c of contas) {
    if (c.saldo <= 0) continue;
    const chave = c.clientId ?? `avulso:${c.payerName ?? c.id}`;
    const nome = c.clientName ?? c.payerName ?? "Sem cliente vinculado";
    const atraso = Math.max(0, diasEntre(c.dueDate, hoje));
    const atual = mapa.get(chave) ?? { chave, nome, contas: 0, saldo: 0, diasDeAtraso: 0 };
    atual.contas += 1;
    atual.saldo += c.saldo;
    atual.diasDeAtraso = Math.max(atual.diasDeAtraso, atraso);
    mapa.set(chave, atual);
  }
  const devedores = Array.from(mapa.values()).sort((a, b) => b.saldo - a.saldo);
  return { total: devedores.reduce((s, d) => s + d.saldo, 0), contas: devedores.reduce((s, d) => s + d.contas, 0), devedores };
}

export async function inadimplenciaPorCliente(officeId: string, permitido: boolean, agora: Date = new Date()) {
  if (!permitido) return null;
  const hoje = hojeCalendario(agora);
  const abertas = await prisma.receivable.findMany({
    where: { officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, noDueDate: false, dueDate: { lt: hoje } },
    include: { payments: { select: { amount: true } }, client: { select: { id: true, name: true } } },
  });
  return agruparInadimplencia(
    abertas.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.client?.name ?? null,
      payerName: r.payerName,
      dueDate: r.dueDate,
      saldo: saldoEmAberto(r.amount, r.discount, r.surcharge, r.payments.reduce((s, p) => s + p.amount, 0)),
    })),
    hoje
  );
}
