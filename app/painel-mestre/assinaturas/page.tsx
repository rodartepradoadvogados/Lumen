import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { isAsaasConfigured } from "@/lib/asaas";
import { avaliarSaudeCobranca } from "@/lib/billingHealth";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import AssinaturasTable from "@/components/painelMestre/AssinaturasTable";

export const dynamic = "force-dynamic";

export default async function AssinaturasPage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  const agora = new Date();

  // Fase 3 — lista por Office (não por Subscription): confirmado por leitura de
  // lib/actions/subscriptionBilling.ts que a maioria dos escritórios-cliente ainda não tem uma
  // Subscription cadastrada (só o escritório interno nasce com uma, via
  // app/api/admin/setup-lumen/route.ts). Se a consulta fosse só em Subscription, esses
  // escritórios nunca apareceriam aqui e o dono da plataforma não teria como preencher
  // billingCycle/paymentMethod pela primeira vez — que é o objetivo desta tela agora editável.
  //
  // Pedido do dono da plataforma: acrescentar vencimento, situação do pagamento, entrega da
  // cobrança (boleto/QR enviado?) e um selo consolidado de saúde — tudo isso depende da fatura
  // mais recente de cada escritório, que esta página não carregava antes. Duas consultas, não
  // uma por escritório (evita N+1):
  //   1. offices.include.invoices com orderBy+take:1 — o Prisma resolve isso como UMA consulta
  //      relacional (mesmo padrão já usado em lib/actions/painelMestre.ts:listTenantOffices),
  //      não um loop de queries por linha.
  //   2. tenantInvoice.groupBy — UMA consulta agregada pra contar, por escritório, quantas
  //      faturas PENDENTE já venceram (dueDate <= agora). Sem isso teríamos que rodar um count()
  //      por escritório dentro do .map() abaixo.
  const [offices, vencidasGroups] = await Promise.all([
    prisma.office.findMany({
      orderBy: { name: "asc" },
      include: {
        subscription: true,
        invoices: { orderBy: { competencia: "desc" }, take: 1 },
      },
    }),
    prisma.tenantInvoice.groupBy({
      by: ["officeId"],
      where: { status: "PENDENTE", dueDate: { lte: agora } },
      _count: { _all: true },
    }),
  ]);

  const vencidasPorOffice = new Map(vencidasGroups.map((g) => [g.officeId, g._count._all]));

  const rows = offices.map((o) => {
    const ultimaFatura = o.invoices[0]
      ? {
          competencia: o.invoices[0].competencia,
          amount: o.invoices[0].amount,
          dueDate: o.invoices[0].dueDate.toISOString(),
          status: o.invoices[0].status,
          paidAt: o.invoices[0].paidAt ? o.invoices[0].paidAt.toISOString() : null,
          boletoUrl: o.invoices[0].boletoUrl,
          pixQrCodePayload: o.invoices[0].pixQrCodePayload,
          remindersSent: o.invoices[0].remindersSent,
        }
      : null;
    const faturasVencidasAbertas = vencidasPorOffice.get(o.id) ?? 0;

    // Selo "Cobrança OK" — escritório interno (Rodarte Prado) não é cliente de cobrança (não é
    // bloqueado por inadimplência, ver Office.isInternal no schema) então não faz sentido
    // avaliar sua saúde de cobrança com as mesmas regras; a tabela mostra "Interno" pra ele.
    const saude = o.isInternal
      ? null
      : avaliarSaudeCobranca(
          o.subscription
            ? {
                status: o.subscription.status,
                paymentMethod: o.subscription.paymentMethod as "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO" | null,
                asaasCustomerId: o.subscription.asaasCustomerId,
                pixAuthorizationStatus: o.subscription.pixAuthorizationStatus as
                  | "PENDENTE"
                  | "ATIVA"
                  | "CANCELADA"
                  | "REJEITADA"
                  | null,
                startedAt: o.subscription.startedAt,
              }
            : null,
          { billingEmail: o.billingEmail },
          ultimaFatura
            ? {
                status: ultimaFatura.status as "PENDENTE" | "PAGO" | "CANCELADO",
                dueDate: ultimaFatura.dueDate,
                paidAt: ultimaFatura.paidAt,
                boletoUrl: ultimaFatura.boletoUrl,
                pixQrCodePayload: ultimaFatura.pixQrCodePayload,
                remindersSent: ultimaFatura.remindersSent,
              }
            : null,
          faturasVencidasAbertas,
          agora
        );

    return {
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
      ultimaFatura,
      faturasVencidasAbertas,
      saude,
    };
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Assinaturas</h1>
        <p className="text-sm text-white/55 mt-1">
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
