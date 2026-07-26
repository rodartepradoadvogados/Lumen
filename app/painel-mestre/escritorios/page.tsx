import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { listTenantOffices } from "@/lib/actions/painelMestre";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import OfficeListRow from "@/components/painelMestre/OfficeListRow";

export const dynamic = "force-dynamic";

export default async function EscritoriosPage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  const offices = await listTenantOffices();

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Escritórios</h1>
          <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1">
            Escritórios-clientes da plataforma — acesso restrito a Jairo e Rodrigo
          </p>
        </div>
        <Link
          href="/painel-mestre/novo"
          className="inline-flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
        >
          <Plus size={16} /> Novo escritório
        </Link>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Todos os escritórios" subtitle={`${offices.length} cadastrado(s)`} />
        <div className="divide-y divide-white/10">
          {offices.map((o) => (
            <OfficeListRow key={o.id} office={o} />
          ))}
        </div>
      </LumenPanel>
    </div>
  );
}
