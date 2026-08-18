import Link from "next/link";
import { requirePlatformAccess } from "@/lib/platformMember";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import NewOfficeForm from "@/components/painelMestre/NewOfficeForm";

export const dynamic = "force-dynamic";

export default async function NovoEscritorioPage() {
  await requirePlatformAccess();

  return (
    <div className="p-6 max-w-[700px] mx-auto animate-fade-in space-y-6">
      <Link href="/painel-mestre" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Painel Mestre
      </Link>
      <PageHeader title="Novo escritório" subtitle="Cria o acesso e já manda o convite pra definir senha" />
      <Card>
        <CardHeader title="Dados do escritório-cliente" />
        <div className="p-5">
          <NewOfficeForm />
        </div>
      </Card>
    </div>
  );
}
