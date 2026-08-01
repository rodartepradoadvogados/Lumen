import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PAYABLE_KIND_OPTIONS } from "@/lib/despesaProcesso";

export const dynamic = "force-dynamic";

// Backfill pontual (mas reaplicável) do plano de contas de Despesa: insere o grupo NOVO "2.9
// Despesas de Processo" com os 6 filhos que espelham lib/despesaProcesso.ts:PAYABLE_KIND_OPTIONS
// ("Despesas do Processo", Fase 10). lib/defaultOfficeData.ts já foi atualizado com este grupo —
// mas só vale para Office CRIADO DEPOIS desta mudança; escritório já existente ficou sem ele, e é
// isso que esta rota corrige, um Office por vez.
//
// Bem mais simples que /api/admin/setup-plano-contas-acordo (que empurrava códigos existentes
// 1.4→1.7 etc. para abrir espaço): "2.9" é um código que NUNCA existiu em nenhum Office, então não
// há risco nenhum de colisão ou de precisar renumerar/empurrar nada — só falta checar se o Office
// já tem "2.9" (idempotência) e, se não tiver, criar o grupo + os 6 filhos, direto embaixo do
// mesmo nó-raiz "2" (Despesa) que os grupos 2.1 a 2.8 já usam.
//
// Uso: GET /api/admin/setup-plano-contas-despesas-processo (logado como platform owner)
export async function GET() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json(
      { error: "Apenas donos da plataforma podem rodar isso." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const offices = await prisma.office.findMany({ select: { id: true, name: true } });

  const criados: string[] = [];
  const jaAtualizados: string[] = [];
  const semNoRaizDespesa: string[] = [];

  for (const office of offices) {
    const despesa = await prisma.financialCategory.findMany({
      where: { officeId: office.id, kind: "DESPESA" },
      select: { id: true, code: true, parentId: true },
    });

    if (despesa.some((c) => c.code === "2.9")) {
      jaAtualizados.push(office.name);
      continue;
    }

    const raiz = despesa.find((c) => c.code === "2");
    if (!raiz) {
      // Escritório sem o nó-raiz "2" (plano de contas nunca inicializado, ou customizado a ponto
      // de ter apagado a raiz) — não dá pra decidir onde pendurar o grupo novo sozinho.
      semNoRaizDespesa.push(office.name);
      continue;
    }

    await prisma.$transaction([
      prisma.financialCategory.create({
        data: { officeId: office.id, code: "2.9", name: "Despesas de Processo", kind: "DESPESA", parentId: raiz.id, order: 8 },
      }),
    ]);
    const grupo = await prisma.financialCategory.findFirstOrThrow({ where: { officeId: office.id, code: "2.9" }, select: { id: true } });
    await prisma.$transaction(
      PAYABLE_KIND_OPTIONS.filter((o) => o.value !== "OUTROS").map((opt, i) =>
        prisma.financialCategory.create({
          data: { officeId: office.id, code: `2.9.${i + 1}`, name: opt.label, kind: "DESPESA", parentId: grupo.id, order: i },
        })
      )
    );
    criados.push(office.name);
  }

  return NextResponse.json(
    { criados, jaAtualizados, semNoRaizDespesa },
    { headers: { "Cache-Control": "no-store" } }
  );
}
