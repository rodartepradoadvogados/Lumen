import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Ação pontual (rodar uma vez): marca o escritório de quem está logado como "interno" (não
// aparece como cliente de cobrança no Painel Mestre) e dá isPlatformOwner=true pra todo admin
// desse escritório — no caso do Rodarte Prado, isso cobre Jairo e Rodrigo de uma vez.
// Idempotente: rodar de novo não duplica nem desfaz nada.
//
// Uso: GET /api/admin/setup-painel-mestre (logado como admin do Rodarte Prado)
export async function GET() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem rodar isso." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  await prisma.office.update({ where: { id: viewer.officeId }, data: { isInternal: true } });
  const result = await prisma.user.updateMany({
    where: { officeId: viewer.officeId, isAdmin: true },
    data: { isPlatformOwner: true },
  });

  return NextResponse.json(
    { officeMarcadoComoInterno: viewer.officeId, platformOwnersAtivados: result.count },
    { headers: { "Cache-Control": "no-store" } }
  );
}
