import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";
import ClientesSearchList from "@/components/ClientesSearchList";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const clients = await prisma.client.findMany({
    where: { officeId: viewer.officeId },
    include: { _count: { select: { cases: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Contatos
      </Link>
      <PageHeader title="Clientes" subtitle={`${clients.length} cliente(s) cadastrado(s)`} action={<NewContactModal kind="client" />} />
      <Card>
        <ClientesSearchList clients={clients} />
      </Card>
    </div>
  );
}
