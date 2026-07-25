import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Ação pontual de limpeza de backlog: marca como lida, para todos os usuários ativos do
// escritório do admin logado, toda Publicação/Andamento publicado antes da data informada —
// sem mexer no que ainda precisa ser conferido. Disparada via navegador (GET), usando a
// própria sessão de admin já autenticada (mesmo padrão de auth das demais páginas/actions).
//
// Uso: GET /api/admin/mark-old-publications-read?before=2026-07-23
export async function GET(request: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem rodar isso." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const before = request.nextUrl.searchParams.get("before");
  if (!before) {
    return NextResponse.json(
      { error: "Informe ?before=AAAA-MM-DD — marca como lido tudo publicado antes dessa data." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const cutoff = new Date(`${before}T00:00:00`);
  if (Number.isNaN(cutoff.getTime())) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const [users, publications] = await Promise.all([
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true } }),
    prisma.publication.findMany({ where: { officeId: viewer.officeId, publishedAt: { lt: cutoff } }, select: { id: true } }),
  ]);

  let marcadas = 0;
  if (users.length > 0 && publications.length > 0) {
    const result = await prisma.publicationRead.createMany({
      data: publications.flatMap((p) => users.map((u) => ({ publicationId: p.id, userId: u.id }))),
      skipDuplicates: true,
    });
    marcadas = result.count;
  }

  return NextResponse.json(
    { antesDe: before, usuariosAtivos: users.length, publicacoesAfetadas: publications.length, marcacoesCriadas: marcadas },
    { headers: { "Cache-Control": "no-store" } }
  );
}
