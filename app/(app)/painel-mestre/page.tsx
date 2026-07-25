import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { listTenantOffices } from "@/lib/actions/painelMestre";
import { isBtgConfigured, isBtgConnected } from "@/lib/btg";
import { PageHeader, Card, CardHeader, Badge, formatCurrency } from "@/components/ui";
import { Building2, Plus, CreditCard, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ATIVA: "Em dia", SUSPENSA: "Bloqueado", CANCELADA: "Cancelado" };
const STATUS_COLOR: Record<string, "green" | "red" | "slate"> = { ATIVA: "green", SUSPENSA: "red", CANCELADA: "slate" };

export default async function PainelMestrePage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  const [offices, btgConnected] = await Promise.all([listTenantOffices(), isBtgConnected()]);

  const clientes = offices.filter((o) => !o.isInternal);
  const ativos = clientes.filter((o) => o.status === "ATIVA");
  const pendentes = clientes.filter((o) => o.lastInvoice?.status === "PENDENTE" && o.status === "ATIVA");
  const bloqueados = clientes.filter((o) => o.status === "SUSPENSA");
  const mrr = ativos.reduce((sum, o) => sum + (o.monthlyFee ?? 0), 0);

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <PageHeader
        title="Painel Mestre"
        subtitle="Escritórios-clientes da plataforma — acesso restrito a Jairo e Rodrigo"
        action={
          <Link href="/painel-mestre/novo" className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5">
            <Plus size={16} /> Novo escritório
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="BTG Empresas"
          subtitle={btgConnected ? "Conectado — boletos gerados aqui saem de verdade" : "Não conectado — boletos ficam como cobrança combinada por fora até conectar"}
          action={
            btgConnected ? (
              <Badge color="green">Conectado</Badge>
            ) : (
              <a
                href="/api/btg/connect"
                className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-lg px-3 py-2"
              >
                <CreditCard size={13} /> Conectar BTG Empresas
              </a>
            )
          }
        />
        {!isBtgConfigured() && (
          <p className="text-xs text-navy-800/50 dark:text-cream-50/50 p-5 pt-3">
            Faltam as credenciais do app registrado no portal do BTG (BTG_CLIENT_ID/BTG_CLIENT_SECRET) — ver README_BTG.md.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><div className="p-4"><p className="text-[10px] font-semibold text-navy-800/45 dark:text-cream-50/45 uppercase tracking-wide mb-1">MRR ativo</p><p className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">{formatCurrency(mrr)}</p></div></Card>
        <Card><div className="p-4"><p className="text-[10px] font-semibold text-navy-800/45 dark:text-cream-50/45 uppercase tracking-wide mb-1">Com acesso</p><p className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">{ativos.length}</p></div></Card>
        <Card><div className="p-4"><p className="text-[10px] font-semibold text-navy-800/45 dark:text-cream-50/45 uppercase tracking-wide mb-1">Pendências</p><p className="font-serif text-2xl font-bold text-amber-600 dark:text-amber-400">{pendentes.length}</p></div></Card>
        <Card><div className="p-4"><p className="text-[10px] font-semibold text-navy-800/45 dark:text-cream-50/45 uppercase tracking-wide mb-1">Bloqueados</p><p className="font-serif text-2xl font-bold text-bordo-700 dark:text-bordo-400">{bloqueados.length}</p></div></Card>
      </div>

      <Card>
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {offices.map((o) => (
            <Link
              key={o.id}
              href={o.isInternal ? "#" : `/painel-mestre/${o.id}`}
              className={`flex items-center gap-3 px-5 py-3.5 ${o.isInternal ? "cursor-default" : "hover:bg-cream-50 dark:hover:bg-white/5"}`}
            >
              <span className="h-9 w-9 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center shrink-0">
                <Building2 size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 truncate">{o.name}</p>
                <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                  {o.isInternal ? "conta interna" : o.monthlyFee ? `${formatCurrency(o.monthlyFee)}/mês` : "sem plano cadastrado"}
                </p>
              </div>
              {o.isInternal ? (
                <Badge color="slate">Interno</Badge>
              ) : (
                <Badge color={STATUS_COLOR[o.status] ?? "slate"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
              )}
              {!o.isInternal && o.status === "SUSPENSA" && <Lock size={14} className="text-bordo-700 dark:text-bordo-400" />}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
