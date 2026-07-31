import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Painel de status legível das fontes administrativas (PNCP, DOU/INLABS, e as futuras —
// Querido Diário, tribunais de contas etc., ver comentário do model FonteAdministrativa em
// prisma/schema.prisma) do escritório do usuário logado. Existe porque a CAPTURA de verdade
// roda no robô Python, no Railway — o dono do escritório não tem acesso a esse ambiente no
// dia a dia, então é AQUI, numa rota simples do próprio site, que ele confere se cada fonte
// rodou hoje, se deu certo, e o detalhe da última execução, sem precisar abrir o painel do
// Railway. Somente leitura: não dispara nenhuma captura (isso é feito pelos crons
// /api/cron/pncp e /api/cron/dou, que só leem o que o robô Python já gravou).
//
// Uso: GET /api/admin/status-fontes (logado como admin do escritório)

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) {
    return NextResponse.json(
      { error: "Apenas administradores podem ver o status das fontes." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const fontes = await prisma.fonteAdministrativa.findMany({
    where: { officeId: viewer.officeId },
    orderBy: { chave: "asc" },
    select: {
      chave: true,
      nome: true,
      ativa: true,
      ultimaExecucaoAt: true,
      ultimoStatus: true,
      ultimoDetalhe: true,
    },
  });

  return NextResponse.json({ fontes }, { headers: { "Cache-Control": "no-store" } });
}
