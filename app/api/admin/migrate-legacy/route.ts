import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { migrarDadosLegado } from "@/lib/legacyMigration";

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
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const expected = process.env.MIGRATION_SECRET;
  if (!expected || secret !== expected) {
    // Diagnóstico temporário (nenhum dos dois valores em texto puro) — remover depois que a
    // migração real rodar. Ajuda a confirmar se o problema é variável não configurada, valor
    // diferente do esperado, ou espaço/quebra de linha extra colado sem querer.
    return NextResponse.json(
      {
        error: "unauthorized",
        debug: {
          migrationSecretConfigurado: !!expected,
          tamanhoEsperado: expected?.length ?? 0,
          tamanhoRecebido: secret?.length ?? 0,
          recebidoTemEspacoNaPonta: secret ? secret !== secret.trim() : null,
          esperadoTemEspacoNaPonta: expected ? expected !== expected.trim() : null,
        },
      },
      { status: 401 }
    );
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
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido durante a migração." },
      { status: 500 }
    );
  }
}
