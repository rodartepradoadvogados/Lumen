import { prisma } from "@/lib/prisma";
import { PageHeader, Card, formatCurrency } from "@/components/ui";
import NewPayableModal from "@/components/NewPayableModal";
import PayablesList from "@/components/PayablesList";
import RecurringExpenseCard from "@/components/RecurringExpenseCard";
import Link from "next/link";
import { ChevronDown, Download, Repeat2 } from "lucide-react";
import { getLeafCategoryOptions } from "@/lib/categories";
import { getFilteredPayables, getCurrentMonthRange } from "@/lib/financeQuery";
import { valorLiquido } from "@/lib/financeCalc";
import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DespesasPage({
  searchParams,
}: {
  searchParams: { tab?: string; from?: string; to?: string; costCenterId?: string; q?: string; categoryId?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  // Sem De/Até na URL, filtra pelo mês corrente por padrão (pedido explícito — antes o site
  // mostrava todo o histórico até o usuário preencher De/Até, mesmo problema que o app mobile já
  // resolvia com este mesmo helper, ver getCurrentMonthRange em lib/financeQuery.ts).
  const defaultRange = getCurrentMonthRange();
  const from = searchParams.from || defaultRange.from;
  const to = searchParams.to || defaultRange.to;
  const effectiveSearchParams = { ...searchParams, from, to };

  const filtered = await getFilteredPayables(effectiveSearchParams, viewer.officeId);
  // Líquido (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = filtered.reduce((s, p) => s + valorLiquido(p.amount, p.discount, p.surcharge), 0);
  const tab = searchParams.tab === "pagas" || searchParams.tab === "todas" ? searchParams.tab : "abertas";

  const [categories, cases, costCenters, suppliers, responsibles, bankAccounts, recurringExpenses, clients] = await Promise.all([
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.case.findMany({ where: { officeId: viewer.officeId, status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Despesas recorrentes ativas (ver RecurringExpense, prisma/schema.prisma) — mostradas como
    // cards no topo da listagem, mesmo padrão de RecurringFeeCard dentro do Processo.
    prisma.recurringExpense.findMany({ where: { officeId: viewer.officeId, active: true }, orderBy: { createdAt: "asc" } }),
    // "Pago a" > Cliente (repasse de valor de condenação, devolução de adiantamento etc.) — ver
    // ContraparteField.tsx.
    prisma.client.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const exportHref = (() => {
    const params = new URLSearchParams();
    Object.entries({ ...effectiveSearchParams, tipo: "pagar" }).forEach(([k, v]) => v && params.set(k, v));
    return `/api/financeiro/export?${params.toString()}`;
  })();

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { ...effectiveSearchParams, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/financeiro/despesas${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
        ← Financeiro
      </Link>
      <PageHeader
        title="Despesas"
        subtitle={`${filtered.length} lançamento(s) · Total ${formatCurrency(total)}`}
        action={
          <NewPayableModal
            categories={categories}
            cases={cases.map((c) => ({ id: c.id, name: c.title }))}
            costCenters={costCenters}
            suppliers={suppliers}
            teamMembers={responsibles}
            clients={clients}
            responsibles={responsibles}
            bankAccounts={bankAccounts}
            defaultResponsibleId={viewer.id}
          />
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Contas a Pagar" href={qs({ tab: undefined })} active={tab === "abertas"} />
        <FilterLink label="Pagas" href={qs({ tab: "pagas" })} active={tab === "pagas"} />
        <FilterLink label="Todas" href={qs({ tab: "todas" })} active={tab === "todas"} />
      </div>

      <Card className="mb-4">
        <form className="p-4 flex flex-wrap items-end gap-3">
          {searchParams.tab && <input type="hidden" name="tab" value={searchParams.tab} />}
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-tx-2 block mb-1">Buscar</label>
            <input type="text" name="q" defaultValue={searchParams.q} placeholder="Descrição ou fornecedor" className="fp-input w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Categoria</label>
            <select name="categoryId" defaultValue={searchParams.categoryId} className="fp-input">
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">
              De {tab === "pagas" ? "(pago em)" : "(vencimento)"}
            </label>
            <input type="date" name="from" defaultValue={from} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">
              Até {tab === "pagas" ? "(pago em)" : "(vencimento)"}
            </label>
            <input type="date" name="to" defaultValue={to} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Centro de Custo</label>
            <select name="costCenterId" defaultValue={searchParams.costCenterId} className="fp-input">
              <option value="">Todos</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 transition-colors">
            Filtrar
          </button>
          <a
            href={exportHref}
            className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 flex items-center gap-1.5 transition-colors"
          >
            <Download size={15} /> Exportar .xlsx
          </a>
          {(searchParams.from || searchParams.to || searchParams.costCenterId || searchParams.q || searchParams.categoryId) && (
            <Link href={qs({ from: undefined, to: undefined, costCenterId: undefined, q: undefined, categoryId: undefined })} className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx px-2">
              Limpar filtros
            </Link>
          )}
        </form>
      </Card>

      {recurringExpenses.length > 0 && (
        <Card className="mb-4 overflow-hidden">
          {/* Recolhido por padrão — abre só com o clique do usuário (pedido explícito: a lista de
              despesas fixas não deve ocupar espaço acima da listagem principal por padrão). */}
          <details className="group">
            <summary className="flex items-center justify-between gap-2 px-5 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-sf-apoio">
              <span className="flex items-center gap-2 text-sm font-semibold text-tx">
                <Repeat2 size={14} className="text-marca-tx" />
                Despesas recorrentes ativas
                <span className="text-xs font-normal text-tx-2">({recurringExpenses.length})</span>
              </span>
              <ChevronDown size={16} className="text-tx-3 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-regua">
              <p className="text-[11px] text-tx-2 px-5 pt-3 pb-1">
                Despesas recorrentes ativas — cada mês já vira uma conta normal (ex.: &ldquo;nome — {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}&rdquo;) na aba{" "}
                <strong>Contas a Pagar</strong> abaixo, com Dar Baixa e anexo de comprovante iguais a qualquer outro lançamento. &ldquo;Encerrar&rdquo; aqui só para de gerar os meses futuros.
              </p>
              {recurringExpenses.map((expense) => (
                <RecurringExpenseCard key={expense.id} expense={{ id: expense.id, description: expense.description, amount: expense.amount, dueDay: expense.dueDay }} />
              ))}
            </div>
          </details>
        </Card>
      )}

      <Card>
        <PayablesList
          payables={filtered.map((p) => ({
            id: p.id,
            description: p.description,
            supplier: p.supplier,
            supplierId: p.supplierId,
            payeeUserId: p.payeeUserId,
            payeeClientId: p.payeeClientId,
            amount: p.amount,
            discount: p.discount,
            surcharge: p.surcharge,
            dueDate: p.dueDate.toISOString(),
            noDueDate: p.noDueDate,
            status: p.status,
            effectiveStatus: p.effectiveStatus,
            paidAmount: p.paidAmount,
            paidDate: p.paidDate ? p.paidDate.toISOString() : null,
            paidSum: p.paidSum,
            paymentReceiptNumber: p.paymentReceiptNumber,
            paymentMethod: p.paymentMethod,
            documentType: p.documentType,
            documentNumber: p.documentNumber,
            categoryId: p.categoryId,
            costCenterId: p.costCenterId,
            caseId: p.caseId,
            responsibleId: p.responsibleId,
            issueDate: p.issueDate ? p.issueDate.toISOString() : null,
            installmentBoleto: p.installmentBoleto,
            installmentNumber: p.installmentNumber,
            installmentTotal: p.installmentTotal,
            groupId: p.groupId,
            recurringExpenseId: p.recurringExpenseId,
            category: p.category ? { name: p.category.name } : null,
            costCenter: p.costCenter ? { name: p.costCenter.name } : null,
            case: p.case ? { title: p.case.title } : null,
            kind: p.kind,
            expensePayer: p.expensePayer,
            reimbursementReceivable: p.reimbursementReceivable
              ? { id: p.reimbursementReceivable.id, amount: p.reimbursementReceivable.amount, status: p.reimbursementReceivable.status }
              : null,
            receiptDriveUrl: p.receiptDriveUrl,
            receiptFileName: p.receiptFileName,
          }))}
          categories={categories}
          cases={cases.map((c) => ({ id: c.id, name: c.title }))}
          costCenters={costCenters}
          suppliers={suppliers}
          teamMembers={responsibles}
          clients={clients}
          responsibles={responsibles}
          bankAccounts={bankAccounts}
        />
      </Card>
      <style>{`
        .fp-input { border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.45rem 0.65rem; font-size: 0.8rem; background-color: var(--sf); color: var(--tx); }
        .fp-input:focus { outline: none; border-color: var(--acao); box-shadow: 0 0 0 2px color-mix(in srgb, var(--acao) 35%, transparent); }
      `}</style>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active
          ? "bg-acao text-acao-tx"
          : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
      }`}
    >
      {label}
    </Link>
  );
}
