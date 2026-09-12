import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePlatformAccess } from "@/lib/platformMember";
import { listTenantOffices } from "@/lib/actions/painelMestre";
import { prisma } from "@/lib/prisma";
import { avaliarSaudeCobranca } from "@/lib/billingHealth";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import OfficeListRow from "@/components/painelMestre/OfficeListRow";

export const dynamic = "force-dynamic";

export default async function EscritoriosPage() {
  await requirePlatformAccess();

  const agora = new Date();

  // listTenantOffices() alimenta Cockpit/Financeiro também e não inclui Subscription/campos de
  // fatura o bastante pra avaliarSaudeCobranca — busca dedicada aqui, mesmo formato de
  // app/painel-mestre/[officeId]/page.tsx (aba "Cobrança & Assinatura", Fase 3 do plano de
  // reforma), que assumiu o lugar da antiga página /painel-mestre/assinaturas: o pedido original
  // ("bater o olho e saber se a cobrança está saudável, sem abrir cada escritório") passa a ser
  // resolvido aqui, um selo por linha (ver OfficeListRow.tsx), em vez de numa página própria.
  const [offices, officesSaude, vencidasGroups] = await Promise.all([
    listTenantOffices(),
    prisma.office.findMany({
      where: { isInternal: false },
      select: {
        id: true,
        billingEmail: true,
        subscription: { select: { status: true, paymentMethod: true, asaasCustomerId: true, pixAuthorizationStatus: true, startedAt: true } },
        invoices: { orderBy: { competencia: "desc" }, take: 1, select: { status: true, dueDate: true, paidAt: true, boletoUrl: true, pixQrCodePayload: true, remindersSent: true } },
      },
    }),
    prisma.tenantInvoice.groupBy({
      by: ["officeId"],
      where: { status: "PENDENTE", dueDate: { lte: agora } },
      _count: { _all: true },
    }),
  ]);

  const vencidasPorOffice = new Map(vencidasGroups.map((g) => [g.officeId, g._count._all]));
  const saudeByOffice = new Map(
    officesSaude.map((o) => {
      const s = o.subscription;
      const fatura = o.invoices[0];
      const saude = avaliarSaudeCobranca(
        s
          ? {
              status: s.status,
              paymentMethod: s.paymentMethod as "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO" | null,
              asaasCustomerId: s.asaasCustomerId,
              pixAuthorizationStatus: s.pixAuthorizationStatus as "PENDENTE" | "ATIVA" | "CANCELADA" | "REJEITADA" | null,
              startedAt: s.startedAt,
            }
          : null,
        { billingEmail: o.billingEmail },
        fatura
          ? {
              status: fatura.status as "PENDENTE" | "PAGO" | "CANCELADO",
              dueDate: fatura.dueDate,
              paidAt: fatura.paidAt,
              boletoUrl: fatura.boletoUrl,
              pixQrCodePayload: fatura.pixQrCodePayload,
              remindersSent: fatura.remindersSent,
            }
          : null,
        vencidasPorOffice.get(o.id) ?? 0,
        agora
      );
      return [o.id, saude] as const;
    })
  );

  const rows = offices.map((o) => ({ ...o, saude: saudeByOffice.get(o.id) ?? null }));

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-tx">Escritórios</h1>
          <p className="text-sm text-tx-2 mt-1">
            Escritórios-clientes da plataforma — acesso restrito a Jairo e Rodrigo
          </p>
        </div>
        {/* Secundário — "Novo" está na lista explícita de botões secundários do DESIGN-SYSTEM.md
            §4; cadastrar um escritório não é a ação primária desta tela. */}
        <Link
          href="/painel-mestre/novo"
          className="inline-flex items-center gap-1.5 bg-sf-apoio hover:bg-sf-superficie border border-regua text-tx text-sm font-semibold px-4 py-2.5 rounded-sm"
        >
          <Plus size={16} /> Novo escritório
        </Link>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Todos os escritórios" subtitle={`${offices.length} cadastrado(s)`} />
        <div className="divide-y divide-regua">
          {rows.map((o) => (
            <OfficeListRow key={o.id} office={o} />
          ))}
        </div>
      </LumenPanel>
    </div>
  );
}
