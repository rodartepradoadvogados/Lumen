import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";
import EditClientModal from "@/components/EditClientModal";
import DeleteButton from "@/components/DeleteButton";
import { deleteClient } from "@/lib/actions/contatos";

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
        {clients.length === 0 ? (
          <EmptyState title="Nenhum cliente cadastrado" />
        ) : (
          <div className="divide-y divide-regua">
            {clients.map((c) => (
              <div key={c.id} id={`client-${c.id}`} className="flex items-center gap-4 px-5 py-3.5 target:bg-acao-bg scroll-mt-20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/contatos/clientes/${c.id}`} className="text-sm font-medium text-tx hover:text-acao hover:underline">
                      {c.name}
                    </Link>
                    <Badge color={c.type === "PJ" ? "navy" : "slate"}>{c.type}</Badge>
                  </div>
                  <p className="text-xs text-tx-3 mt-0.5">
                    {c.document && <span>{c.document} · </span>}
                    {c.email}
                    {c.phone && <span> · {c.phone}</span>}
                  </p>
                </div>
                <span className="text-xs text-tx-3 shrink-0">{c._count.cases} processo(s)</span>
                <div className="shrink-0 flex items-center gap-1">
                  <EditClientModal client={c} />
                  <DeleteButton id={c.id} action={deleteClient} confirmMessage={`Excluir o cliente "${c.name}"?`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
