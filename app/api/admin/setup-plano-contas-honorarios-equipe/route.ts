import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Backfill pontual (mas reaplicável) do plano de contas de Despesa: insere "2.2.4 Honorários de
// Estagiário" como irmã de 2.2.1 Salário / 2.2.2 Pró-labore / 2.2.3 Pagamento de Advogado
// Parceiro, dentro do grupo "2.2 Folha e Pró-labore" — ver lib/defaultOfficeData.ts (já
// atualizado, mas só vale para Office CRIADO DEPOIS desta mudança) e o novo campo
// Payable.payeeUserId (pagar honorário de advogado contratado/estagiário direto a um membro da
// equipe, sem cadastrar Fornecedor).
// Idempotente: Office que já tem "2.2.4" é pulado.
//
// Uso: GET /api/admin/setup-plano-contas-honorarios-equipe (logado como platform owner)
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
  const semGrupoFolha: string[] = [];

  for (const office of offices) {
    const despesa = await prisma.financialCategory.findMany({
      where: { officeId: office.id, kind: "DESPESA", code: { in: ["2.2", "2.2.4"] } },
      select: { id: true, code: true, parentId: true },
    });

    if (despesa.some((c) => c.code === "2.2.4")) {
      jaAtualizados.push(office.name);
      continue;
    }

    const grupoFolha = despesa.find((c) => c.code === "2.2");
    if (!grupoFolha) {
      semGrupoFolha.push(office.name);
      continue;
    }

    await prisma.financialCategory.create({
      data: { officeId: office.id, code: "2.2.4", name: "Honorários de Estagiário", kind: "DESPESA", parentId: grupoFolha.id, order: 3 },
    });
    criados.push(office.name);
  }

  return NextResponse.json({ criados, jaAtualizados, semGrupoFolha }, { headers: { "Cache-Control": "no-store" } });
}
