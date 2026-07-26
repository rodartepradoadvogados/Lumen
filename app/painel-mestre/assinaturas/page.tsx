import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/components/ui";
import { LumenPanel, LumenPanelHeader, LumenStatusDot } from "@/components/painelMestre/LumenUi";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { ATIVA: "Ativa", TESTE: "Teste", SUSPENSA: "Suspensa", CANCELADA: "Cancelada" };
const STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "slate"> = {
  ATIVA: "ok",
  TESTE: "warn",
  SUSPENSA: "risk",
  CANCELADA: "risk",
};

export default async function AssinaturasPage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  // Somente leitura nesta fase — editar continua sendo feito dentro do detalhe do escritório
  // (/painel-mestre/[officeId]), que não muda de comportamento, só de casca visual.
  const subscriptions = await prisma.subscription.findMany({
    include: { office: { select: { name: true, isInternal: true } } },
    orderBy: { office: { name: "asc" } },
  });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Assinaturas</h1>
        <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1">
          Planos e cobrança de cada escritório-cliente — somente leitura
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Assinaturas" subtitle={`${subscriptions.length} assinatura(s)`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide border-b border-white/10">
                <th className="px-5 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Plano</th>
                <th className="px-3 py-2.5 font-semibold">Valor</th>
                <th className="px-3 py-2.5 font-semibold">Vencimento</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {subscriptions.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3">
                    <span className="text-navy-900 dark:text-cream-50 font-medium">{s.office.name}</span>
                    {s.internal && (
                      <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-navy-800/40 dark:text-cream-50/40 border border-navy-800/15 dark:border-white/15 rounded px-1.5 py-0.5">
                        interno
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-navy-800/80 dark:text-cream-50/80">{s.planKey}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-navy-900 dark:text-cream-50">{formatCurrency(s.monthlyFee)}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-navy-800/70 dark:text-cream-50/70">dia {s.dueDay}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-800/80 dark:text-cream-50/80">
                      <LumenStatusDot tone={STATUS_TONE[s.status] ?? "slate"} /> {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-navy-800/40 dark:text-cream-50/40 text-sm">
                    Nenhuma assinatura cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
    </div>
  );
}
