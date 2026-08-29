import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { Card } from "@/components/ui";
import MobileNewAssessoriaForm from "@/components/mobile/MobileNewAssessoriaForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileNewAssessoriaPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  if (!(await getOfficeModules(viewer.officeId)).assessoria) redirect("/m");

  const [clientsWithoutAssessoria, users] = await Promise.all([
    prisma.client.findMany({ where: { type: "PJ", assessoria: null, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/assessoria" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Assessoria
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Nova Assessoria</h1>
        <p className="text-sm text-tx-2">Vincule uma empresa (cliente PJ) já cadastrada a um contrato de assessoria</p>
      </div>

      <Card className="p-4">
        <MobileNewAssessoriaForm clients={clientsWithoutAssessoria} users={users} />
      </Card>
    </div>
  );
}
