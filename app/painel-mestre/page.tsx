import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";
import { requirePlatformAccess } from "@/lib/platformMember";
import { listTenantOffices } from "@/lib/actions/painelMestre";
import { isBtgConfigured, isBtgConnected } from "@/lib/btg";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/components/ui";
import { LumenPanel, LumenPanelHeader, LumenStat, LumenStatusDot } from "@/components/painelMestre/LumenUi";
import OfficeListRow from "@/components/painelMestre/OfficeListRow";

export const dynamic = "force-dynamic";

const OFFICE_PREVIEW_COUNT = 6;
const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function CockpitPage() {
  await requirePlatformAccess();

  const noventaDiasAtras = new Date(Date.now() - NOVENTA_DIAS_MS);
  const [offices, btgConnected, accessSessions90d] = await Promise.all([
    listTenantOffices(),
    isBtgConnected(),
    prisma.accessSession.count({ where: { startedAt: { gte: noventaDiasAtras } } }),
  ]);

  const clientes = offices.filter((o) => !o.isInternal);
  const ativos = clientes.filter((o) => o.status === "ATIVA");
  const pendentes = clientes.filter((o) => o.lastInvoice?.status === "PENDENTE" && o.status === "ATIVA");
  const bloqueados = clientes.filter((o) => o.status === "SUSPENSA");
  const mrr = ativos.reduce((sum, o) => sum + (o.monthlyFee ?? 0), 0);
  const preview = offices.slice(0, OFFICE_PREVIEW_COUNT);

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cockpit</h1>
        <p className="text-sm text-white/55 mt-1">Visão executiva da plataforma Lúmen</p>
      </div>

      <LumenPanel>
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-white/10">
          <LumenStat label="MRR ativo" value={formatCurrency(mrr)} />
          <LumenStat label="Com acesso" value={String(ativos.length)} tone="ok" />
          <LumenStat label="Pendências" value={String(pendentes.length)} tone="warn" />
          <LumenStat label="Bloqueados" value={String(bloqueados.length)} tone="risk" />
          <LumenStat label="Acessos ao cofre (90d)" value={String(accessSessions90d)} />
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader
          title="BTG Empresas"
          subtitle={
            btgConnected
              ? "Conectado — boletos gerados aqui saem de verdade"
              : "Não conectado — boletos ficam como cobrança combinada por fora até conectar"
          }
        />
        <div className="p-5 pt-3 flex items-center justify-between gap-3 flex-wrap">
          {!isBtgConfigured() && (
            <p className="text-xs text-white/50">
              Faltam as credenciais do app registrado no portal do BTG (BTG_CLIENT_ID/BTG_CLIENT_SECRET) — ver README_BTG.md.
            </p>
          )}
          <div className="ml-auto">
            {btgConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-concluido">
                <LumenStatusDot tone="ok" /> Conectado
              </span>
            ) : (
              <a
                href="/api/btg/connect"
                className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-2"
              >
                <CreditCard size={13} /> Conectar BTG Empresas
              </a>
            )}
          </div>
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Escritórios" subtitle={`${offices.length} escritório(s) cadastrado(s)`} />
        <div className="divide-y divide-white/10">
          {preview.map((o) => (
            <OfficeListRow key={o.id} office={o} />
          ))}
        </div>
        <div className="px-5 py-3 border-t border-white/10">
          {/* Link de navegação — não é marca, é ação (DESIGN-SYSTEM.md §4: "Ver tudo →" é o
              exemplo textual do botão terciário/link, que usa --acao). */}
          <Link
            href="/painel-mestre/escritorios"
            className="inline-flex items-center gap-1 text-xs font-semibold text-acao hover:underline"
          >
            Ver todos <ArrowRight size={12} />
          </Link>
        </div>
      </LumenPanel>
    </div>
  );
}
