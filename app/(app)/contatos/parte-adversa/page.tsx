import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";

export const dynamic = "force-dynamic";

export default async function ParteAdversaPage() {
  const parties = await prisma.opposingParty.findMany({
    include: { _count: { select: { cases: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Contatos
      </Link>
      <PageHeader title="Parte Adversa" subtitle={`${parties.length} registro(s)`} action={<NewContactModal kind="opposing" />} />
      <Card>
        {parties.length === 0 ? (
          <EmptyState title="Nenhuma parte adversa cadastrada" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {parties.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900">{p.name}</p>
                    <Badge color={p.type === "PJ" ? "navy" : "slate"}>{p.type}</Badge>
                  </div>
                  <p className="text-xs text-navy-800/45 mt-0.5">
                    {p.document && <span>{p.document} · </span>}
                    {p.email}
                    {p.phone && <span> · {p.phone}</span>}
                  </p>
                </div>
                <span className="text-xs text-navy-800/40 shrink-0">{p._count.cases} processo(s)</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
