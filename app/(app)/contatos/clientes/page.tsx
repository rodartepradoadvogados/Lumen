import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";
import EditClientModal from "@/components/EditClientModal";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await prisma.client.findMany({
    include: { _count: { select: { cases: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Contatos
      </Link>
      <PageHeader title="Clientes" subtitle={`${clients.length} cliente(s) cadastrado(s)`} action={<NewContactModal kind="client" />} />
      <Card>
        {clients.length === 0 ? (
          <EmptyState title="Nenhum cliente cadastrado" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {clients.map((c) => (
              <div key={c.id} id={`client-${c.id}`} className="flex items-center gap-4 px-5 py-3.5 target:bg-gold-500/10 scroll-mt-20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900">{c.name}</p>
                    <Badge color={c.type === "PJ" ? "navy" : "slate"}>{c.type}</Badge>
                  </div>
                  <p className="text-xs text-navy-800/45 mt-0.5">
                    {c.document && <span>{c.document} · </span>}
                    {c.email}
                    {c.phone && <span> · {c.phone}</span>}
                  </p>
                </div>
                <span className="text-xs text-navy-800/40 shrink-0">{c._count.cases} processo(s)</span>
                <EditClientModal client={c} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
