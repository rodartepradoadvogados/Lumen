import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { migrarDadosLegado } from "@/lib/legacyMigration";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Migração pontual dos dados do rp-financeiro (legado) para um Office do Lúmen — disparada
// via navegador (GET com secret na URL) porque quem precisa rodar isso não necessariamente
// tem acesso a um terminal. Protegida por MIGRATION_SECRET (variável de ambiente só sua,
// nunca comitada) — sem ela configurada, a rota recusa qualquer chamada.
//
// Uso: GET /api/admin/migrate-legacy?secret=SEU_SEGREDO&officeSlug=rodarte-prado-advogados
//
// Requer também SOURCE_DATABASE_URL (conexão com o banco do rp-financeiro) configurada nas
// variáveis de ambiente deste projeto (Lúmen) na Vercel.
//
// SEGURANÇA (achado V6, auditoria de 05/09/2026): esta era a única rota admin do projeto cujo
// único gate era o segredo — nenhuma outra checagem de sessão. Um segredo em query string pode
// vazar por log de acesso/histórico do navegador mais facilmente que um header; mantemos o
// segredo na URL de propósito (é o motivo do design — disparar colando um link no navegador, sem
// terminal), mas agora ele deixa de ser suficiente sozinho: soma-se `isPlatformOwner` na sessão
// de quem chama, mesmo padrão de defesa em profundidade já usado por setup-painel-mestre. E o
// erro devolvido ao cliente deixa de ecoar `error.message` cru (podia vazar host/usuário da
// connection string de SOURCE_DATABASE_URL) — o detalhe completo vai só para o log do servidor.
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const expected = process.env.MIGRATION_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const viewer = await getCurrentUser();
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  if (!sourceUrl) {
    return NextResponse.json({ error: "SOURCE_DATABASE_URL não configurada nas variáveis de ambiente." }, { status: 500 });
  }

  const officeSlug = request.nextUrl.searchParams.get("officeSlug");
  const officeName = request.nextUrl.searchParams.get("officeName") || "Rodarte Prado Advogados";
  if (!officeSlug) {
    return NextResponse.json({ error: "Informe ?officeSlug=... (o slug do escritório de destino)." }, { status: 400 });
  }

  try {
    const result = await migrarDadosLegado({ sourceUrl, destDb: prisma, officeSlug, officeName });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[migrate-legacy] falha durante a migração:", error);
    return NextResponse.json(
      { error: "Erro durante a migração. Veja os logs do servidor para detalhes." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
