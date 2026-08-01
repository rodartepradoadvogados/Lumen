import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { naturezaWhere, type CaseNatureza } from "@/lib/caseNatureza";
import { isAnotacaoLinkType, anotacaoLinkNeedsEntity, type AnotacaoLinkType } from "@/lib/anotacoes";

export const dynamic = "force-dynamic";

// Lista de opções para o sub-seletor (EntityPicker) do painel global de Anotações — carregada sob
// demanda quando o usuário escolhe um chip que precisa de entidade específica (Processo
// Judicial/Administrativo, Caso, Assessoria, Atendimento), nunca pré-carregada no layout, já que
// o painel existe em toda página do site. Sempre filtrada por officeId da SESSÃO (nunca recebido
// do cliente) — o mesmo isolamento por escritório de qualquer outra consulta do produto.
//
// Uso: GET /api/anotacoes/entidades?tipo=PROCESSO_JUDICIAL|PROCESSO_ADMINISTRATIVO|CASO|ASSESSORIA|ATENDIMENTO
export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const tipoParam = req.nextUrl.searchParams.get("tipo") ?? "";
  if (!isAnotacaoLinkType(tipoParam) || !anotacaoLinkNeedsEntity(tipoParam as AnotacaoLinkType)) {
    return NextResponse.json({ options: [] });
  }
  const tipo = tipoParam as AnotacaoLinkType;

  if (tipo === "ASSESSORIA") {
    const assessorias = await prisma.assessoria.findMany({
      where: { officeId: viewer.officeId },
      include: { client: { select: { name: true } } },
      orderBy: { client: { name: "asc" } },
      take: 500,
    });
    return NextResponse.json({ options: assessorias.map((a) => ({ id: a.id, name: a.client.name })) });
  }

  if (tipo === "ATENDIMENTO") {
    const attendances = await prisma.attendance.findMany({
      where: { officeId: viewer.officeId },
      select: { id: true, clientName: true, subject: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({ options: attendances.map((a) => ({ id: a.id, name: `${a.clientName} — ${a.subject}` })) });
  }

  // PROCESSO_JUDICIAL | PROCESSO_ADMINISTRATIVO | CASO — mesmo model Case, agrupado por
  // natureza (ver lib/caseNatureza.ts, reaproveitado aqui em vez de reescrever o filtro).
  const natureza: CaseNatureza = tipo === "PROCESSO_JUDICIAL" ? "JUDICIAL" : tipo === "PROCESSO_ADMINISTRATIVO" ? "ADMINISTRATIVO" : "CASO";
  const cases = await prisma.case.findMany({
    where: { officeId: viewer.officeId, ...naturezaWhere(natureza) },
    select: { id: true, title: true, processNumber: true },
    orderBy: { title: "asc" },
    take: 500,
  });
  return NextResponse.json({
    options: cases.map((c) => ({ id: c.id, name: c.processNumber ? `${c.title} — ${c.processNumber}` : c.title })),
  });
}
