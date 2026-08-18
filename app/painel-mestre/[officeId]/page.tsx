import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAccess } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import OfficeDetailPanel from "@/components/painelMestre/OfficeDetailPanel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ATIVA: "Em dia", SUSPENSA: "Bloqueado", CANCELADA: "Cancelado" };
const STATUS_COLOR: Record<string, "green" | "red" | "slate"> = { ATIVA: "green", SUSPENSA: "red", CANCELADA: "slate" };

export default async function OfficeDetailPage({ params }: { params: { officeId: string } }) {
  await requirePlatformAccess();

  const office = await prisma.office.findUnique({
    where: { id: params.officeId },
    include: {
      invoices: { orderBy: { competencia: "desc" }, take: 12 },
      users: { where: { active: true }, select: { id: true, name: true, email: true, isAdmin: true } },
      subscription: { select: { paymentMethod: true } },
    },
  });
  if (!office || office.isInternal) notFound();

  return (
    <div className="p-6 max-w-[700px] mx-auto animate-fade-in space-y-6">
      <Link href="/painel-mestre" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Painel Mestre
      </Link>
      <PageHeader
        title={office.name}
        subtitle={`Cliente desde ${office.createdAt.toLocaleDateString("pt-BR")}`}
        action={<Badge color={STATUS_COLOR[office.status] ?? "slate"}>{STATUS_LABEL[office.status] ?? office.status}</Badge>}
      />

      <Card>
        <CardHeader title="Equipe" subtitle={`${office.users.length} pessoa(s) ativa(s)`} />
        <div className="divide-y divide-regua">
          {office.users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-tx">{u.name}</span>
              <span className="text-[11px] text-tx-3">{u.email}{u.isAdmin ? " · admin" : ""}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Cobrança e acesso" />
        <div className="p-5">
          <OfficeDetailPanel
            officeId={office.id}
            status={office.status}
            initialModules={{
              financeiro: office.moduloFinanceiro,
              whatsapp: office.moduloWhatsapp,
              atendimento: office.moduloAtendimento,
              assessoria: office.moduloAssessoria,
            }}
            initialBilling={{
              billingEmail: office.billingEmail ?? "",
              monthlyFee: office.monthlyFee ?? 0,
              billingDueDay: office.billingDueDay ?? 5,
              paymentGraceDays: office.paymentGraceDays,
              cnpj: office.cnpj ?? "",
            }}
            paymentMethod={office.subscription?.paymentMethod ?? null}
            invoices={office.invoices.map((i) => ({
              id: i.id,
              competencia: i.competencia,
              amount: i.amount,
              dueDate: i.dueDate.toISOString(),
              status: i.status,
              boletoUrl: i.boletoUrl,
              paymentMethod: i.paymentMethod,
              pixQrCodePayload: i.pixQrCodePayload,
              pixQrCodeImage: i.pixQrCodeImage,
            }))}
          />
        </div>
      </Card>
    </div>
  );
}
