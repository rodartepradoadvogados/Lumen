import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Ação pontual de BOOTSTRAP (rodar uma vez): marca o escritório de quem está logado como
// "interno" (não aparece como cliente de cobrança no Painel Mestre) e dá isPlatformOwner=true
// pra todo admin desse escritório — no caso do Rodarte Prado, isso cobre Jairo e Rodrigo de uma
// vez. Idempotente: rodar de novo não duplica nem desfaz nada.
//
// SEGURANÇA — por que exige um segredo de ambiente, e não só isAdmin:
// isAdmin é o admin do PRÓPRIO escritório, e todo escritório-cliente tem o seu. Enquanto o único
// guard aqui era isAdmin, qualquer admin de qualquer escritório-cliente podia chamar esta rota
// pelo navegador e (a) marcar o próprio escritório como isInternal, saindo da cobrança, e (b)
// conceder isPlatformOwner a si mesmo — o que abre o Painel Mestre e, com ele, os dados de TODOS
// os escritórios. Era escalação de privilégio por um GET, sem nenhuma credencial a mais.
//
// Não dá pra exigir isPlatformOwner (o guard das demais rotas de setup, ver
// app/api/admin/setup-lumen): esta é justamente a rota que cria o PRIMEIRO dono da plataforma —
// exigir o que ela concede a tornaria impossível de rodar. Por isso usa o mesmo padrão de
// segredo de ambiente já adotado em app/api/admin/migrate-legacy: sem PAINEL_MESTRE_SETUP_SECRET
// configurada, a rota recusa qualquer chamada (fail-closed). O isAdmin continua exigido como
// segunda barreira, para o segredo sozinho não bastar.
//
// Uso: GET /api/admin/setup-painel-mestre?secret=SEU_SEGREDO (logado como admin do escritório)
export async function GET(request: NextRequest) {
  const expected = process.env.PAINEL_MESTRE_SETUP_SECRET;
  const secret = request.nextUrl.searchParams.get("secret");
  // Fail-closed: variável não configurada = rota desligada. Sem isso, um ambiente que esqueceu
  // de definir o segredo voltaria a aceitar qualquer admin, que é exatamente a falha original.
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem rodar isso." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  await prisma.office.update({ where: { id: viewer.officeId }, data: { isInternal: true, blogAccess: true } });
  const result = await prisma.user.updateMany({
    where: { officeId: viewer.officeId, isAdmin: true },
    data: { isPlatformOwner: true },
  });

  return NextResponse.json(
    { officeMarcadoComoInterno: viewer.officeId, platformOwnersAtivados: result.count },
    { headers: { "Cache-Control": "no-store" } }
  );
}
