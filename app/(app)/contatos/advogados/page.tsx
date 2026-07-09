import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";

export const dynamic = "force-dynamic";

export default async function AdvogadosPage({ searchParams }: { searchParams: { side?: string } }) {
  const lawyers = await prisma.lawyer.findMany({
    where: { side: searchParams.side || undefined },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Contatos
      </Link>
      <PageHeader title="Advogados" subtitle={`${lawyers.length} registro(s)`} action={<NewContactModal kind="lawyer" />} />

      <div className="flex gap-2 mb-4">
        <FilterLink label="Todos" href="/contatos/advogados" active={!searchParams.side} />
        <FilterLink label="Parceiros" href="/contatos/advogados?side=PARCEIRO" active={searchParams.side === "PARCEIRO"} />
        <FilterLink label="Adversos" href="/contatos/advogados?side=ADVERSO" active={searchParams.side === "ADVERSO"} />
      </div>

      <Card>
        {lawyers.length === 0 ? (
          <EmptyState title="Nenhum advogado cadastrado" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {lawyers.map((l) => (
              <div key={l.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900">{l.name}</p>
                    <Badge color={l.side === "PARCEIRO" ? "green" : "red"}>{l.side}</Badge>
                  </div>
                  <p className="text-xs text-navy-800/45 mt-0.5">
                    {l.oab && <span>{l.oab} · </span>}
                    {l.firm}
                    {l.phone && <span> · {l.phone}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
        active ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
      }`}
    >
      {label}
    </Link>
  );
}
