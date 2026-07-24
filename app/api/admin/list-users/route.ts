import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Diagnóstico pontual pra descobrir por que um login está falhando depois da migração —
// lista os e-mails cadastrados pra um escritório, mascarados (nunca a senha/hash). Protegida
// pelo mesmo MIGRATION_SECRET da rota de migração. Remover depois que o problema de login
// for resolvido.
//
// Uso: GET /api/admin/list-users?secret=SEU_SEGREDO&officeSlug=rodarte-prado-advogados
function mascarar(email: string): string {
  const [nome, dominio] = email.split("@");
  if (!dominio) return "***";
  const visivel = nome.slice(0, 2);
  return `${visivel}${"*".repeat(Math.max(nome.length - 2, 1))}@${dominio}`;
}

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const expected = process.env.MIGRATION_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const officeSlug = request.nextUrl.searchParams.get("officeSlug");
  if (!officeSlug) {
    return NextResponse.json({ error: "Informe ?officeSlug=..." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const office = await prisma.office.findUnique({ where: { slug: officeSlug } });
  if (!office) {
    return NextResponse.json({ error: `Nenhum escritório com slug "${officeSlug}".` }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const users = await prisma.user.findMany({
    where: { officeId: office.id },
    select: { name: true, email: true, isAdmin: true, active: true },
    orderBy: { name: "asc" },
  });

  const checarEmail = request.nextUrl.searchParams.get("checarEmail");
  const normalizado = checarEmail?.trim().toLowerCase();
  const bate = normalizado ? users.some((u) => u.email.trim().toLowerCase() === normalizado) : null;

  return NextResponse.json(
    {
      office: office.name,
      totalUsuarios: users.length,
      usuarios: users.map((u) => ({ nome: u.name, email: mascarar(u.email), admin: u.isAdmin, ativo: u.active })),
      ...(checarEmail ? { checouEmail: checarEmail, encontrouExatamente: bate } : {}),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
