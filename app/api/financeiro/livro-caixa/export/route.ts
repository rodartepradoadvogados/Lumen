import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/currentUser";
import { extratoComSaldo } from "@/lib/caixaMovimentos";
import { formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

// Mesma lógica de saldo/filtro da tela (app/(app)/financeiro/livro-caixa/page.tsx) — sem teto de
// linhas: quem exportou já filtrou de propósito, e o próprio ponto da exportação é levar tudo.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.financeAccess) {
    return NextResponse.json({ error: "Você não tem acesso ao módulo Financeiro." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const de = sp.get("from") ? new Date(sp.get("from")!) : undefined;
  const ate = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59`) : new Date();

  const linhas = await extratoComSaldo(user.officeId, { de, ate });
  const rows = linhas.map((l) => ({
    Data: formatDate(l.data),
    Descrição: l.descricao,
    Valor: l.valor,
    "Saldo Acumulado": l.saldo,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ["Data", "Descrição", "Valor", "Saldo Acumulado"] });
  worksheet["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 14 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Livro Caixa");
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="livro-caixa-${stamp}.xlsx"`,
    },
  });
}
