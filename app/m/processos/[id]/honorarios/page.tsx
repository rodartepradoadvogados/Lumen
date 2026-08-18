import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getLeafCategoryOptions } from "@/lib/categories";
import { effectiveCaseClients } from "@/lib/caseParties";
import MobileLancarHonorariosForm from "@/components/mobile/MobileLancarHonorariosForm";
import AccessRestrictedNotice from "@/components/AccessRestrictedNotice";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Página inteira (não modal) de Lançar Honorários dentro de um processo específico — o pedido
// central desta fase ("no financeiro, não consegui lançar o financeiro como é por dentro do
// site, dentro de um processo"). caseId vem fixo da rota; ver MobileLancarHonorariosForm para a
// versão sem processo fixo (app/m/financeiro/receitas/honorarios).
export default async function MobileLancarHonorariosPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  // notFound() aqui devolveria um 404 genérico para o que na verdade é falta de permissão — o
  // desktop mostra "Acesso restrito" no mesmo cenário (achado A49 da revisão gauntlet).
  if (!(viewer.isAdmin || viewer.financeAccess)) return <AccessRestrictedNotice moduleName="Financeiro" />;

  const c = await prisma.case.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: { clients: { include: { client: true } }, client: true, receivables: { select: { status: true, amount: true, paidAmount: true } } },
  });
  if (!c) notFound();

  const [categories, costCenters, responsibles, bankAccounts] = await Promise.all([
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const caseClients = effectiveCaseClients(c);
  const alreadyReceivedForCase = c.receivables
    .filter((r) => r.status === "PAGO")
    .reduce((s, r) => s + (r.paidAmount ?? r.amount), 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href={`/m/processos/${c.id}?tab=financeiro`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2"
      >
        <ArrowLeft size={13} /> {c.title}
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Lançar Honorários</h1>
        <p className="text-sm text-tx-2">{c.title}</p>
      </div>

      <MobileLancarHonorariosForm
        fixedCaseId={c.id}
        fixedCaseBases={{
          caseValue: c.caseValue,
          economicBenefitValue: c.economicBenefitValue,
          convictionValue: c.convictionValue,
          agreementValue: c.agreementValue,
        }}
        categories={categories}
        clients={caseClients.map((cc) => ({ id: cc.id, name: cc.name }))}
        costCenters={costCenters}
        responsibles={responsibles}
        bankAccounts={bankAccounts}
        defaultClientId={c.clientId ?? undefined}
        defaultResponsibleId={viewer.id}
        alreadyReceivedForCase={alreadyReceivedForCase}
        afterSaveHref={`/m/processos/${c.id}?tab=financeiro`}
      />
    </div>
  );
}
