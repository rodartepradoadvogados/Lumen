import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card } from "@/components/ui";
import DelegateTaskForm from "@/components/DelegateTaskForm";

export const dynamic = "force-dynamic";

// Delegar tarefas e compromissos. Morava em Gestão > Produtividade > Delegar; é uma AÇÃO, e a
// seção Gestão passou a ser de leitura do escritório — o formulário foi para a Agenda, sem
// alteração. /produtividade?aba=delegar redireciona para cá.
export default async function DelegarPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  const users = await prisma.user.findMany({
    where: { active: true, officeId: viewer.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div className="tela space-y-6">
      <PageHeader title="Delegar" subtitle="Delegue tarefas e compromissos para outros membros da equipe" />
      <Card>
        <DelegateTaskForm users={users} />
      </Card>
    </div>
  );
}
