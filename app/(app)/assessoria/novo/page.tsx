import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card } from "@/components/ui";
import NewAssessoriaForm from "@/components/assessoria/NewAssessoriaForm";

export const dynamic = "force-dynamic";

export default async function NewAssessoriaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const [clientsWithoutAssessoria, users] = await Promise.all([
    prisma.client.findMany({ where: { type: "PJ", assessoria: null, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
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
