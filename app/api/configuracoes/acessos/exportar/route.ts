import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { listOfficeAccessLog } from "@/lib/supportAccess";
import { buildAccessLogCsv, safeFileFragment } from "@/lib/accessLogCsv";

export const dynamic = "force-dynamic";

// Extrato de acessos exportável (Fase C, comprovação nº 2): o cliente leva embora um CSV com o
// histórico de acessos de suporte ao próprio escritório, pra guardar/mandar pro compliance dele
// sem depender de confiar na nossa palavra nem de continuar logado no Lúmen depois.
//
// officeId NUNCA vem de parâmetro de rota/query — só de getCurrentUser(), que resolve a partir
// do cookie de sessão. Isso é o que impede um usuário autenticado de pedir o extrato de OUTRO
// escritório trocando um id na URL. O único parâmetro aceito (`dias`) controla o período, nunca
// de quem é o período.
//
// CSV, não PDF: é o formato pedido — simples, abre em qualquer planilha, e o compliance do
// cliente consegue processar. Não há dependência de PDF já instalada neste projeto que sirva
// para texto tabular (xlsx gera .xlsx, não .pdf), e a instrução do projeto proíbe instalar
// dependência nova só para isso.
//
// Montagem do CSV em si mora em lib/accessLogCsv.ts (pura, testável sem HTTP nem banco — ver
// scripts/testar-comprovacao.ts); esta rota só resolve QUEM está pedindo e devolve os bytes.
const DEFAULT_DAYS = 90;
const MIN_DAYS = 1;
const MAX_DAYS = 365;

export async function GET(request: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
  }

  const officeId = viewer.officeId; // sempre do usuário autenticado, nunca de query/param.

  const rawDays = Number(request.nextUrl.searchParams.get("dias"));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.max(Math.trunc(rawDays), MIN_DAYS), MAX_DAYS) : DEFAULT_DAYS;

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } });
  const officeName = office?.name ?? "Escritório";

  const log = await listOfficeAccessLog(officeId, days);
  const csv = buildAccessLogCsv({ officeName, days, log });

  // BOM UTF-8: sem ele, o Excel (o destino mais comum de um CSV baixado por um sócio de
  // escritório) interpreta acentuação em pt-BR como Latin-1 e corrompe o texto.
  const body = "\uFEFF" + csv;
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `acessos-lumen-${safeFileFragment(officeName) || "escritorio"}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
