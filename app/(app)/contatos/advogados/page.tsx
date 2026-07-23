import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";
import EditLawyerModal from "@/components/EditLawyerModal";
import DeleteButton from "@/components/DeleteButton";
import { deleteLawyer } from "@/lib/actions/contatos";

export const dynamic = "force-dynamic";

export default async function AdvogadosPage({ searchParams }: { searchParams: { side?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const lawyers = await prisma.lawyer.findMany({
    where: { side: searchParams.side || undefined, officeId: viewer.officeId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
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
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {lawyers.map((l) => (
              <div key={l.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{l.name}</p>
                    <Badge color={l.side === "PARCEIRO" ? "green" : "red"}>{l.side}</Badge>
                  </div>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                    {l.oab && <span>{l.oab} · </span>}
                    {l.firm}
                    {l.phone && <span> · {l.phone}</span>}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <EditLawyerModal lawyer={l} />
                  <DeleteButton id={l.id} action={deleteLawyer} confirmMessage={`Excluir o advogado "${l.name}"?`} />
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
        active
          ? "bg-navy-900 text-white dark:bg-white/10 dark:text-cream-50"
          : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}
