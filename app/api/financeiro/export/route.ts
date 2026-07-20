import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/currentUser";
import { getFilteredPayables, getFilteredReceivables, FinanceSearchParams } from "@/lib/financeQuery";
import { formatDate } from "@/components/ui";
import { paymentMethodLabels } from "@/lib/paymentMethods";

export const dynamic = "force-dynamic";

const kindLabels: Record<string, string> = {
  HONORARIOS_CONTRATUAIS: "Honorários Contratuais",
  HONORARIOS_SUCUMBENCIAIS: "Honorários Sucumbenciais",
  REEMBOLSO: "Reembolso",
  OUTROS: "Outros",
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.financeAccess) {
    return NextResponse.json({ error: "Você não tem acesso ao módulo Financeiro." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const tipo = sp.get("tipo") === "receber" ? "receber" : "pagar";
  const params: FinanceSearchParams = {
    status: sp.get("status") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    costCenterId: sp.get("costCenterId") || undefined,
    q: sp.get("q") || undefined,
    categoryId: sp.get("categoryId") || undefined,
  };

  let rows: Record<string, string | number>[];
  if (tipo === "pagar") {
    const payables = await getFilteredPayables(params);
    rows = payables.map((p) => ({
      Descrição: p.description,
      "Fornecedor/Cliente": p.supplier || "",
      Categoria: p.category ? `${p.category.code} ${p.category.name}` : "",
      "Centro de Custo": p.costCenter?.name || "",
      Vencimento: p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate),
      Valor: p.amount,
      Status: p.effectiveStatus,
      "Pago em": p.paidDate ? formatDate(p.paidDate) : "",
      "Valor pago": p.paidAmount ?? "",
      "Forma de Pagamento": p.paymentMethod ? paymentMethodLabels[p.paymentMethod] ?? p.paymentMethod : "",
      Comprovante: p.paymentReceiptNumber || "",
    }));
  } else {
    const receivables = await getFilteredReceivables(params);
    rows = receivables.map((r) => ({
      Descrição: r.description,
      "Fornecedor/Cliente": r.client?.name || "",
      Categoria: r.category ? `${r.category.code} ${r.category.name}` : kindLabels[r.kind] || "",
      "Centro de Custo": r.costCenter?.name || "",
      Vencimento: r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate),
      Valor: r.amount,
      Status: r.effectiveStatus,
      "Pago em": r.paidDate ? formatDate(r.paidDate) : "",
      "Valor pago": r.paidAmount ?? "",
      "Forma de Pagamento": r.paymentMethod ? paymentMethodLabels[r.paymentMethod] ?? r.paymentMethod : "",
      Comprovante: r.paymentReceiptNumber || "",
    }));
  }

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Descrição", "Fornecedor/Cliente", "Categoria", "Centro de Custo", "Vencimento", "Valor", "Status", "Pago em", "Valor pago", "Forma de Pagamento", "Comprovante"],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, tipo === "pagar" ? "Contas a Pagar" : "Contas a Receber");
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `contas-a-${tipo}-${stamp}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
