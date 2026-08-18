import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getLeafCategoryOptions } from "@/lib/categories";
import MobileLancarHonorariosForm from "@/components/mobile/MobileLancarHonorariosForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Lançar Honorários sem partir de dentro de um processo — precisa de um seletor de processo
// (obrigatório: honorário sem processo não existe, ver createHonorarioLancamento). As quatro
// bases de cálculo (valor da causa/proveito/condenação/acordo) já vêm embutidas em cada processo
// buscado aqui, então o formulário nunca precisa de um Server Action novo para resolver a base
// escolhida ao trocar de processo.
export default async function MobileLancarHonorariosGeralPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const [cases, categories, clients, costCenters, responsibles, bankAccounts] = await Promise.all([
    prisma.case.findMany({
      where: { officeId: viewer.officeId, status: "ATIVO" },
      select: { id: true, title: true, caseValue: true, economicBenefitValue: true, convictionValue: true, agreementValue: true },
      orderBy: { title: "asc" },
    }),
    getLeafCategoryOptions("RECEITA", viewer.officeId),
    prisma.client.findMany({ where: { officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.costCenter.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({ where: { officeId: viewer.officeId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/financeiro/receitas" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Receitas
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Lançar Honorários</h1>
        <p className="text-sm text-tx-2">Escolha o processo — honorário sempre fica vinculado a um processo</p>
      </div>

      {cases.length === 0 ? (
        <p className="text-sm text-tx-2 py-6 text-center">Nenhum processo ativo cadastrado ainda.</p>
      ) : (
        <MobileLancarHonorariosForm
          cases={cases}
          categories={categories}
          clients={clients}
          costCenters={costCenters}
          responsibles={responsibles}
          bankAccounts={bankAccounts}
          defaultResponsibleId={viewer.id}
        />
      )}
    </div>
  );
}
