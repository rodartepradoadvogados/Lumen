import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import NewSupplierModal from "@/components/NewSupplierModal";
import EditSupplierModal from "@/components/EditSupplierModal";
import DeleteButton from "@/components/DeleteButton";
import { deleteSupplier } from "@/lib/actions/suppliers";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const suppliers = await prisma.supplier.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
        ← Contatos
      </Link>
      <PageHeader title="Fornecedores" subtitle={`${suppliers.length} registro(s)`} action={<NewSupplierModal />} />

      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="Nenhum fornecedor cadastrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {suppliers.map((s) => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{s.name}</p>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                    {s.document && <span>{s.document} · </span>}
                    {s.email}
                    {s.phone && <span> · {s.phone}</span>}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <EditSupplierModal supplier={s} />
                  <DeleteButton id={s.id} action={deleteSupplier} confirmMessage={`Excluir o fornecedor "${s.name}"?`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
