import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import NewAssessoriaForm from "@/components/assessoria/NewAssessoriaForm";

export const dynamic = "force-dynamic";

export default async function NewAssessoriaPage() {
  const [clientsWithoutAssessoria, users] = await Promise.all([
    prisma.client.findMany({ where: { type: "PJ", assessoria: null }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="p-6 max-w-xl mx-auto animate-fade-in">
      <PageHeader title="Nova Assessoria" subtitle="Vincule uma empresa (cliente PJ) já cadastrada a um contrato de assessoria" />
      <Card className="p-6">
        <NewAssessoriaForm clients={clientsWithoutAssessoria} users={users} />
      </Card>
    </div>
  );
}
