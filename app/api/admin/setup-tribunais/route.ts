import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { TRIBUNAIS_CATALOG } from "@/lib/tribunaisCatalog";

export const dynamic = "force-dynamic";

// Preenchimento (e reaplicação de correções futuras) do catálogo global de tribunais, a
// partir de lib/tribunaisCatalog.ts. Tribunal não tem officeId — é dado de referência
// compartilhado por toda a plataforma, não por escritório — então a checagem de acesso segue
// o mesmo padrão de /api/admin/setup-lumen (dado de plataforma, não de um Office específico):
// só platform owner roda. Idempotente via upsert por sigla: rodar de novo não duplica, só
// atualiza os campos caso o catálogo mude.
//
// Uso: GET /api/admin/setup-tribunais (logado como platform owner)
export async function GET() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json(
      { error: "Apenas donos da plataforma podem rodar isso." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  let processados = 0;
  for (const t of TRIBUNAIS_CATALOG) {
    await prisma.tribunal.upsert({
      where: { sigla: t.sigla },
      create: { sigla: t.sigla, nome: t.nome, categoria: t.categoria, sistemas: t.sistemas, portalUrl: t.portalUrl, ordem: t.ordem },
      update: { nome: t.nome, categoria: t.categoria, sistemas: t.sistemas, portalUrl: t.portalUrl, ordem: t.ordem },
    });
    processados++;
  }

  return NextResponse.json(
    { tribunaisProcessados: processados },
    { headers: { "Cache-Control": "no-store" } }
  );
}
