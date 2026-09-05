import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Backfill pontual de Licitacao.nome (campo novo, ver prisma/schema.prisma) — mesma lógica de
// scripts/backfill-licitacao-nome.ts, só que disparável pelo navegador (GET), porque este
// ambiente de deploy não dá acesso a terminal com a DATABASE_URL de produção. Preenche `nome`
// com o texto de `objeto` em toda Licitacao de QUALQUER escritório da plataforma que ainda não
// tenha nome (a Licitação é multi-tenant, sem gate de officeId de propósito — mesmo raciocínio
// de scripts/backfill-lawyer-tag.ts, que também roda contra o banco inteiro). Idempotente: rodar
// de novo não afeta linhas que já têm nome.
//
// Uso: GET /api/admin/backfill-licitacao-nome (autenticado como dono da plataforma).
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const semNome = await prisma.licitacao.findMany({ where: { nome: null }, select: { id: true, objeto: true } });
    for (const l of semNome) {
      await prisma.licitacao.update({ where: { id: l.id }, data: { nome: l.objeto } });
    }
    return NextResponse.json(
      { atualizadas: semNome.length, ids: semNome.map((l) => l.id) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[backfill-licitacao-nome] falha durante o backfill:", error);
    return NextResponse.json(
      { error: "Erro durante o backfill. Veja os logs do servidor para detalhes." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
