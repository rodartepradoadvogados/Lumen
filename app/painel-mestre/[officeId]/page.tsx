import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { contarOabsMonitoradas, contarProcessos } from "@/lib/officeLimits";
import { avaliarSaudeCobranca } from "@/lib/billingHealth";
import { isAsaasConfigured } from "@/lib/asaas";
import { LumenPanel, LumenPanelHeader, LumenStatusDot } from "@/components/painelMestre/LumenUi";
import OfficeCobrancaTab from "@/components/painelMestre/OfficeCobrancaTab";
import OfficeFaturasTab from "@/components/painelMestre/OfficeFaturasTab";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ATIVA: "Em dia", SUSPENSA: "Bloqueado", CANCELADA: "Cancelado" };
const STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "slate"> = { ATIVA: "ok", SUSPENSA: "risk", CANCELADA: "slate" };

// Reforma do Painel da Empresa (Fase 3, ver .impeccable/plano-painel-mestre/
// andamento-painel-mestre.md): de página estreita (max-w-[700px], Cards empilhados) pra layout
// largo com abas — mesmo padrão de searchParams.tab já usado em app/(app)/processos/[id]/page.tsx
// e app/m/processos/[id]/page.tsx, não um mecanismo novo. "Assinatura" deixa de ser página própria
// (/painel-mestre/assinaturas, removida) e entra como aba "Cobrança & Assinatura" — o selo de
// saúde que justificava aquela página agora aparece na lista (Escritórios, ver OfficeListRow.tsx)
// e em detalhe aqui, na aba Faturas.
const TABS = [
  { key: "visao-geral", label: "Visão Geral" },
  { key: "equipe", label: "Equipe" },
  { key: "cobranca", label: "Cobrança & Assinatura" },
  { key: "faturas", label: "Faturas" },
  { key: "uso", label: "Uso" },
];

export default async function OfficeDetailPage({
  params,
  searchParams,
}: {
  params: { officeId: string };
  searchParams: { tab?: string };
}) {
  await requirePlatformAccess();

  const agora = new Date();

  const [office, plans, modulePrices, oabs, processos, vencidasAbertas] = await Promise.all([
    prisma.office.findUnique({
      where: { id: params.officeId },
      include: {
        invoices: {
          orderBy: { competencia: "desc" },
          take: 12,
          select: {
            id: true, competencia: true, amount: true, dueDate: true, status: true, paidAt: true,
            boletoUrl: true, paymentMethod: true, pixQrCodePayload: true, pixQrCodeImage: true, remindersSent: true,
          },
        },
        users: { where: { active: true }, select: { id: true, name: true, email: true, isAdmin: true } },
        subscription: {
          select: { status: true, paymentMethod: true, asaasCustomerId: true, pixAuthorizationStatus: true, startedAt: true, billingCycle: true, discountPercent: true },
        },
      },
    }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.modulePrice.findMany(),
    contarOabsMonitoradas(params.officeId),
    contarProcessos(params.officeId),
    prisma.tenantInvoice.count({ where: { officeId: params.officeId, status: "PENDENTE", dueDate: { lte: agora } } }),
  ]);
  if (!office || office.isInternal) notFound();

  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "visao-geral";

  const saude = avaliarSaudeCobranca(
    office.subscription
      ? {
          status: office.subscription.status,
          paymentMethod: office.subscription.paymentMethod as "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO" | null,
          asaasCustomerId: office.subscription.asaasCustomerId,
          pixAuthorizationStatus: office.subscription.pixAuthorizationStatus as "PENDENTE" | "ATIVA" | "CANCELADA" | "REJEITADA" | null,
          startedAt: office.subscription.startedAt,
        }
      : null,
    { billingEmail: office.billingEmail },
    office.invoices[0]
      ? {
          status: office.invoices[0].status as "PENDENTE" | "PAGO" | "CANCELADO",
          dueDate: office.invoices[0].dueDate,
          paidAt: office.invoices[0].paidAt,
          boletoUrl: office.invoices[0].boletoUrl,
          pixQrCodePayload: office.invoices[0].pixQrCodePayload,
          remindersSent: office.invoices[0].remindersSent,
        }
      : null,
    vencidasAbertas,
    agora
  );

  return (
    <div className="p-6 max-w-[1280px] mx-auto animate-fade-in space-y-5">
      <Link href="/painel-mestre/escritorios" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Escritórios
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-tx">{office.name}</h1>
          <p className="text-xs text-tx-2 mt-0.5">Cliente desde {office.createdAt.toLocaleDateString("pt-BR")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tx-2">
          <LumenStatusDot tone={STATUS_TONE[office.status] ?? "slate"} /> {STATUS_LABEL[office.status] ?? office.status}
        </span>
      </div>

      <div className="flex gap-1 border-b border-regua overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/painel-mestre/${office.id}?tab=${t.key}`}
            className={`shrink-0 text-corpo font-semibold px-3.5 py-2.5 border-b-2 -mb-px ${
              tab === t.key ? "text-tx border-marca-tx" : "text-tx-2 border-transparent hover:text-tx"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "visao-geral" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LumenPanel>
            <LumenPanelHeader title="Assinatura" />
            <div className="p-5 space-y-2 text-sm">
              <Field label="Plano" value={plans.find((p) => p.id === office.planId)?.name ?? "Sem plano definido"} />
              <Field label="Ciclo" value={office.subscription ? (office.subscription.billingCycle === "SEMESTRAL" ? "Semestral" : "Mensal") : "—"} />
              <Field label="Forma de pagamento" value={office.subscription?.paymentMethod ?? "Não configurada"} />
            </div>
          </LumenPanel>
          <LumenPanel>
            <LumenPanelHeader title="Uso" />
            <div className="p-5 space-y-2 text-sm">
              <Field label="OABs monitoradas" value={`${oabs}${office.oabLimit != null ? ` / ${office.oabLimit}` : ""}`} />
              <Field label="Processos ativos" value={`${processos}${office.caseLimit != null ? ` / ${office.caseLimit}` : ""}`} />
            </div>
          </LumenPanel>
          <LumenPanel className="lg:col-span-2">
            <LumenPanelHeader title="Equipe" subtitle={`${office.users.length} pessoa(s) ativa(s)`} />
            <div className="divide-y divide-regua">
              {office.users.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-tx">{u.name}</span>
                  <span className="text-etiqueta text-tx-3">{u.email}{u.isAdmin ? " · admin" : ""}</span>
                </div>
              ))}
            </div>
          </LumenPanel>
        </div>
      )}

      {tab === "equipe" && (
        <LumenPanel>
          <LumenPanelHeader title="Equipe" subtitle={`${office.users.length} pessoa(s) ativa(s)`} />
          <div className="divide-y divide-regua">
            {office.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-tx">{u.name}</span>
                <span className="text-etiqueta text-tx-3">{u.email}{u.isAdmin ? " · admin" : ""}</span>
              </div>
            ))}
          </div>
        </LumenPanel>
      )}

      {tab === "cobranca" && (
        <OfficeCobrancaTab
          officeId={office.id}
          status={office.status}
          plans={plans}
          modulePrices={modulePrices}
          pricingMode={office.pricingMode}
          usage={{ oabs, processos }}
          initialPlanId={office.planId}
          initialModules={{
            financeiro: office.moduloFinanceiro,
            whatsapp: office.moduloWhatsapp,
            atendimento: office.moduloAtendimento,
            assessoria: office.moduloAssessoria,
          }}
          initialModulePrices={{
            financeiro: office.precoFinanceiro,
            whatsapp: office.precoWhatsapp,
            atendimento: office.precoAtendimento,
            assessoria: office.precoAssessoria,
          }}
          initialOabLimit={office.oabLimit}
          initialCaseLimit={office.caseLimit}
          initialBilling={{
            billingEmail: office.billingEmail ?? "",
            monthlyFee: office.monthlyFee ?? 0,
            billingDueDay: office.billingDueDay ?? 5,
            paymentGraceDays: office.paymentGraceDays,
            cnpj: office.cnpj ?? "",
          }}
          subscription={
            office.subscription
              ? {
                  billingCycle: office.subscription.billingCycle as "MENSAL" | "SEMESTRAL",
                  paymentMethod: (office.subscription.paymentMethod as "" | "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO" | null) ?? "",
                  discountPercent: office.subscription.discountPercent,
                  pixAuthorizationStatus: office.subscription.pixAuthorizationStatus as "PENDENTE" | "ATIVA" | "CANCELADA" | "REJEITADA" | null,
                }
              : null
          }
          asaasConfigured={isAsaasConfigured()}
        />
      )}

      {tab === "faturas" && (
        <OfficeFaturasTab
          officeId={office.id}
          invoices={office.invoices.map((i) => ({
            id: i.id,
            competencia: i.competencia,
            amount: i.amount,
            dueDate: i.dueDate.toISOString(),
            status: i.status,
            paidAt: i.paidAt ? i.paidAt.toISOString() : null,
            boletoUrl: i.boletoUrl,
            paymentMethod: i.paymentMethod,
            pixQrCodePayload: i.pixQrCodePayload,
            pixQrCodeImage: i.pixQrCodeImage,
            remindersSent: i.remindersSent,
          }))}
          paymentMethod={office.subscription?.paymentMethod ?? null}
          pixAuthorizationStatus={office.subscription?.pixAuthorizationStatus ?? null}
          faturasVencidasAbertas={vencidasAbertas}
          saude={saude}
        />
      )}

      {tab === "uso" && (
        <LumenPanel>
          <LumenPanelHeader title="Limites do plano" />
          <div className="p-5 space-y-2 text-sm">
            <Field label="OABs monitoradas" value={office.oabLimit != null ? `${oabs} de ${office.oabLimit}` : `${oabs} (sem limite)`} />
            <Field label="Processos ativos" value={office.caseLimit != null ? `${processos} de ${office.caseLimit}` : `${processos} (sem limite)`} />
          </div>
        </LumenPanel>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-regua pb-2 last:border-0 last:pb-0">
      <span className="text-tx-2">{label}</span>
      <span className="font-medium text-tx text-right">{value}</span>
    </div>
  );
}
