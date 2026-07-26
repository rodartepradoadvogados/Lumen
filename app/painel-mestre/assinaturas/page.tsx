import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { isAsaasConfigured } from "@/lib/asaas";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import AssinaturasTable from "@/components/painelMestre/AssinaturasTable";

export const dynamic = "force-dynamic";

export default async function AssinaturasPage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  // Fase 3 — lista por Office (não por Subscription): confirmado por leitura de
  // lib/actions/subscriptionBilling.ts que a maioria dos escritórios-cliente ainda não tem uma
  // Subscription cadastrada (só o escritório interno nasce com uma, via
  // app/api/admin/setup-lumen/route.ts). Se a consulta fosse só em Subscription, esses
  // escritórios nunca apareceriam aqui e o dono da plataforma não teria como preencher
  // billingCycle/paymentMethod pela primeira vez — que é o objetivo desta tela agora editável.
  const offices = await prisma.office.findMany({
    orderBy: { name: "asc" },
    include: { subscription: true },
  });

  const rows = offices.map((o) => ({
    id: o.id,
    name: o.name,
    isInternal: o.isInternal,
    subscription: o.subscription
      ? {
          monthlyFee: o.subscription.monthlyFee,
          status: o.subscription.status,
          billingCycle: o.subscription.billingCycle,
          paymentMethod: o.subscription.paymentMethod,
          discountPercent: o.subscription.discountPercent,
          pixAuthorizationStatus: o.subscription.pixAuthorizationStatus,
        }
      : null,
  }));

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Assinaturas</h1>
        <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1">
          Ciclo, forma de pagamento e desconto de cada escritório-cliente
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Assinaturas" subtitle={`${rows.length} escritório(s)`} />
        <AssinaturasTable offices={rows} asaasConfigured={isAsaasConfigured()} />
      </LumenPanel>
    </div>
  );
}
