import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getLeafCategoryOptions } from "@/lib/categories";
import MobileNewPayableForm from "@/components/mobile/MobileNewPayableForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Página inteira (não modal) de Lançar Despesa dentro de um processo específico — Fase 10
// ("Despesas do Processo"), mesmo padrão de app/m/processos/[id]/honorarios/page.tsx (Lançar
// Honorários): caseId vem fixo da rota, sem seletor de processo. Reaproveita
// MobileNewPayableForm (o mesmo formulário compacto da tela geral de Despesas) em modo
// `startOpen`, que revela Natureza da despesa + "Quem arca com o custo" por causa de fixedCaseId.
export default async function MobileNovaDespesaPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer || !(viewer.isAdmin || viewer.financeAccess)) notFound();

  const c = await prisma.case.findFirst({ where: { id: params.id, officeId: viewer.officeId }, select: { id: true, title: true } });
  if (!c) notFound();

  const [categories, suppliers, costCenters] = await Promise.all([
    getLeafCategoryOptions("DESPESA", viewer.officeId),
    prisma.supplier.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href={`/m/processos/${c.id}?tab=financeiro`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> {c.title}
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Lançar Despesa</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{c.title}</p>
      </div>

      <MobileNewPayableForm
        suppliers={suppliers}
        categories={categories}
        costCenters={costCenters}
        fixedCaseId={c.id}
        startOpen
        afterSaveHref={`/m/processos/${c.id}?tab=financeiro`}
      />
    </div>
  );
}
