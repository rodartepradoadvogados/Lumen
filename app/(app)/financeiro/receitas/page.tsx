import { prisma } from "@/lib/prisma";
import { PageHeader, Card, formatCurrency } from "@/components/ui";
import NewReceivableModal from "@/components/NewReceivableModal";
import LancarHonorariosModal from "@/components/honorarios/LancarHonorariosModal";
import ReceivablesList from "@/components/ReceivablesList";
import Link from "next/link";
import { Download } from "lucide-react";
import { getLeafCategoryOptions } from "@/lib/categories";
import { getFilteredReceivables, getCurrentMonthRange } from "@/lib/financeQuery";
import { valorLiquido } from "@/lib/financeCalc";
import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReceitasPage({
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

  const filtered = await getFilteredReceivables(effectiveSearchParams, viewer.officeId);
  // Líquido (Fase 3 — pendência da Fase 1): amount bruto sozinho ignorava desconto/acréscimo.
  const total = filtered.reduce((s, r) => s + valorLiquido(r.amount, r.discount, r.surcharge), 0);
  const tab = searchParams.tab === "pagas" || searchParams.tab === "todas" || searchParams.tab === "apurar" ? searchParams.tab : "abertas";

  const [categories, cases, clients, costCenters, responsibles, bankAccounts] = await Promise.all([
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    prisma.case.findMany({ where: { officeId: viewer.officeId, status: "ATIVO" }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.client.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const exportHref = (() => {
    const params = new URLSearchParams();
    Object.entries({ ...effectiveSearchParams, tipo: "receber" }).forEach(([k, v]) => v && params.set(k, v));
    return `/api/financeiro/export?${params.toString()}`;
  })();

  const qs = (extra: Record<string, string | undefined>) => {
    const merged = { ...effectiveSearchParams, ...extra };
    const params = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && params.set(k, v));
    const s = params.toString();
    return `/financeiro/receitas${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <Link href="/financeiro" className="text-xs font-semibold text-tx-2 hover:text-tx dark:hover:text-tx">
        ← Financeiro
      </Link>
      <PageHeader
        title="Receitas"
        subtitle={`${filtered.length} lançamento(s) · Total ${formatCurrency(total)}`}
        action={
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <NewReceivableModal
                categories={categories}
                cases={cases.map((c) => ({ id: c.id, name: c.title }))}
                clients={clients}
                costCenters={costCenters}
                responsibles={responsibles}
                bankAccounts={bankAccounts}
                defaultResponsibleId={viewer.id}
              />
              {/* Fase 7 — mesmo modal de Lançar Honorários da aba Financeiro do Processo, só que
                  sem defaultCaseId: quem entra por aqui escolhe o processo dentro do próprio
                  formulário (ver LancarHonorariosModal.tsx, seção Identificação). */}
              <LancarHonorariosModal
                categories={categories}
                clients={clients}
                costCenters={costCenters}
                responsibles={responsibles}
                bankAccounts={bankAccounts}
                cases={cases.map((c) => ({ id: c.id, name: c.title }))}
                defaultResponsibleId={viewer.id}
              />
            </div>
            <p className="text-[11px] text-tx-2 max-w-sm text-right">
              <span className="font-semibold">Nova Conta a Receber</span>: qualquer receita (aluguel, reembolso, venda).{" "}
              <span className="font-semibold">Lançar Honorários</span>: honorário vinculado a processo, com forma de cobrança e apuração de êxito.
            </p>
          </div>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Contas a Receber" href={qs({ tab: undefined })} active={tab === "abertas"} />
        <FilterLink label="Recebidas" href={qs({ tab: "pagas" })} active={tab === "pagas"} />
        <FilterLink label="A apurar" href={qs({ tab: "apurar" })} active={tab === "apurar"} />
        <FilterLink label="Todas" href={qs({ tab: "todas" })} active={tab === "todas"} />
      </div>

      <Card className="mb-4">
        <form className="p-4 flex flex-wrap items-end gap-3">
          {searchParams.tab && <input type="hidden" name="tab" value={searchParams.tab} />}
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-tx-2 block mb-1">Buscar</label>
            <input type="text" name="q" defaultValue={searchParams.q} placeholder="Descrição ou cliente" className="fp-input w-full" />
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
              De {tab === "pagas" ? "(recebido em)" : "(vencimento)"}
            </label>
            <input type="date" name="from" defaultValue={from} className="fp-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">
              Até {tab === "pagas" ? "(recebido em)" : "(vencimento)"}
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

      <Card>
        <ReceivablesList
          receivables={filtered.map((r) => ({
            id: r.id,
            description: r.description,
            amount: r.amount,
            discount: r.discount,
            surcharge: r.surcharge,
            dueDate: r.dueDate.toISOString(),
            noDueDate: r.noDueDate,
            status: r.status,
            effectiveStatus: r.effectiveStatus,
            paidAmount: r.paidAmount,
            paidDate: r.paidDate ? r.paidDate.toISOString() : null,
            paidSum: r.paidSum,
            paymentReceiptNumber: r.paymentReceiptNumber,
            paymentMethod: r.paymentMethod,
            kind: r.kind,
            isSuccessPortion: r.isSuccessPortion,
            documentType: r.documentType,
            documentNumber: r.documentNumber,
            payerType: r.payerType,
            payerName: r.payerName,
            percentual: r.percentual,
            percentualBase: r.percentualBase,
            categoryId: r.categoryId,
            costCenterId: r.costCenterId,
            clientId: r.clientId,
            caseId: r.caseId,
            responsibleId: r.responsibleId,
            issueDate: r.issueDate ? r.issueDate.toISOString() : null,
            installmentBoleto: r.installmentBoleto,
            installmentNumber: r.installmentNumber,
            installmentTotal: r.installmentTotal,
            groupId: r.groupId,
            honorarioLancamentoId: r.honorarioLancamentoId,
            recurringFeeId: r.recurringFeeId,
            category: r.category ? { name: r.category.name } : null,
            costCenter: r.costCenter ? { name: r.costCenter.name } : null,
            case: r.case ? { title: r.case.title } : null,
            client: r.client ? { name: r.client.name } : null,
            reimbursesPayable: r.reimbursesPayable ? { id: r.reimbursesPayable.id, description: r.reimbursesPayable.description } : null,
            receiptDriveUrl: r.receiptDriveUrl,
            receiptFileName: r.receiptFileName,
          }))}
          categories={categories}
          cases={cases.map((c) => ({ id: c.id, name: c.title }))}
          clients={clients}
          costCenters={costCenters}
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
