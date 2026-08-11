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
          <h1 className="text-2xl font-bold text-white">Escritórios</h1>
          <p className="text-sm text-white/55 mt-1">
            Escritórios-clientes da plataforma — acesso restrito a Jairo e Rodrigo
          </p>
        </div>
        {/* Secundário — "Novo" está na lista explícita de botões secundários do DESIGN-SYSTEM.md
            §4; cadastrar um escritório não é a ação primária desta tela. */}
        <Link
          href="/painel-mestre/novo"
          className="inline-flex items-center gap-1.5 bg-grafite-800 hover:bg-grafite-700 border border-white/10 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
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
