import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Backfill pontual (mas reaplicável) do plano de contas de Receita: insere as três categorias
// novas de Honorários — natureza "Acordo" (Fase 9) — como 1.4 Acordo Judicial / 1.5 Acordo
// Extrajudicial / 1.6 Assessoria Jurídica, empurrando as três categorias que já ocupavam esses
// códigos (Reembolso/Rendimentos Financeiros/Outras Receitas) para 1.7/1.8/1.9.
// lib/defaultOfficeData.ts já foi atualizado com essa numeração nova — mas só vale para Office
// CRIADO DEPOIS desta mudança; escritório já existente ficou com os códigos antigos, e é isso
// que esta rota corrige, um Office por vez.
//
// Só mexe em officeId cujo grupo de Receita bater EXATAMENTE com a assinatura antiga (1.1
// Honorários Contratuais / 1.2 Honorários Sucumbenciais / 1.3 Honorários de Consultoria / 1.4
// Reembolso / 1.5 Rendimentos Financeiros / 1.6 Outras Receitas, sem nenhuma categoria extra) —
// se o escritório já editou/renomeou/adicionou algo no meio disso, entra em "revisao" em vez de
// arriscar embaralhar um plano de contas já customizado; alguém decide à mão depois.
// Idempotente: um Office que já tem código "1.7" é sinal de que já passou por esta rota (ou já
// nasceu com o template novo) e é pulado sem tocar em nada.
//
// Uso: GET /api/admin/setup-plano-contas-acordo (logado como platform owner)
export async function GET() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json(
      { error: "Apenas donos da plataforma podem rodar isso." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const OLD_SIGNATURE: Record<string, string> = {
    "1.1": "Honorários Contratuais",
    "1.2": "Honorários Sucumbenciais",
    "1.3": "Honorários de Consultoria",
    "1.4": "Reembolso",
    "1.5": "Rendimentos Financeiros",
    "1.6": "Outras Receitas",
  };

  const offices = await prisma.office.findMany({ select: { id: true, name: true } });

  const migrados: string[] = [];
  const jaAtualizados: string[] = [];
  const semPlanoDeContas: string[] = [];
  const precisamRevisao: { office: string; motivo: string }[] = [];

  for (const office of offices) {
    const receita = await prisma.financialCategory.findMany({
      where: { officeId: office.id, kind: "RECEITA" },
      select: { id: true, code: true, name: true, parentId: true },
    });

    if (receita.length === 0) {
      semPlanoDeContas.push(office.name);
      continue;
    }

    if (receita.some((c) => c.code === "1.7")) {
      jaAtualizados.push(office.name);
      continue;
    }

    const byCode = new Map(receita.map((c) => [c.code, c]));
    const codesEsperados = Object.keys(OLD_SIGNATURE);
    const bateAssinatura =
      receita.length === codesEsperados.length + 1 && // +1 pelo nó-raiz "1" (Receita)
      codesEsperados.every((code) => byCode.get(code)?.name === OLD_SIGNATURE[code]);

    if (!bateAssinatura) {
      precisamRevisao.push({
        office: office.name,
        motivo: `Grupo de Receita não bate com o template padrão — categorias atuais: ${receita.map((c) => `${c.code} ${c.name}`).join(", ")}`,
      });
      continue;
    }

    const raiz = byCode.get("1.1")!; // usa o mesmo parentId dos irmãos já existentes
    await prisma.$transaction([
      // Empurra os três últimos +3 (1.4→1.7, 1.5→1.8, 1.6→1.9) antes de abrir espaço pros novos,
      // pra nunca existirem dois códigos "1.4" ao mesmo tempo dentro da mesma transação.
      prisma.financialCategory.update({ where: { id: byCode.get("1.6")!.id }, data: { code: "1.9" } }),
      prisma.financialCategory.update({ where: { id: byCode.get("1.5")!.id }, data: { code: "1.8" } }),
      prisma.financialCategory.update({ where: { id: byCode.get("1.4")!.id }, data: { code: "1.7" } }),
      prisma.financialCategory.create({
        data: { officeId: office.id, code: "1.4", name: "Acordo Judicial", kind: "RECEITA", parentId: raiz.parentId, order: 3 },
      }),
      prisma.financialCategory.create({
        data: { officeId: office.id, code: "1.5", name: "Acordo Extrajudicial", kind: "RECEITA", parentId: raiz.parentId, order: 4 },
      }),
      prisma.financialCategory.create({
        data: { officeId: office.id, code: "1.6", name: "Assessoria Jurídica", kind: "RECEITA", parentId: raiz.parentId, order: 5 },
      }),
    ]);
    migrados.push(office.name);
  }

  return NextResponse.json(
    { migrados, jaAtualizados, semPlanoDeContas, precisamRevisao },
    { headers: { "Cache-Control": "no-store" } }
  );
}
