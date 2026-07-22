import Link from "next/link";
import { listAssessorias } from "@/lib/actions/assessoria";
import { Card, Badge, EmptyState, formatCurrency } from "@/components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "green" | "slate" | "bordo"> = {
  ATIVA: "green",
  SUSPENSA: "slate",
  ENCERRADA: "bordo",
};
const statusLabels: Record<string, string> = { ATIVA: "Ativa", SUSPENSA: "Suspensa", ENCERRADA: "Encerrada" };

export default async function MobileAssessoria() {
  const assessorias = await listAssessorias();

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Assessoria Jurídica</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">
          {assessorias.length} empresa(s) com contrato de assessoria contínua
        </p>
      </div>

      <Card>
        {assessorias.length === 0 ? (
          <EmptyState title="Nenhuma empresa em assessoria ainda" subtitle="Cadastre pelo computador em Assessoria Jurídica" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessorias.map((a) => (
              <Link
                key={a.id}
                href={`/m/assessoria/${a.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{a.client.name}</p>
                    <Badge color={statusColors[a.status] || "slate"}>{statusLabels[a.status] || a.status}</Badge>
                  </div>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                    {a._count.documents} documento(s) · {a._count.licitacoes} licitação(ões)
                  </p>
                </div>
                <span className="text-xs font-semibold text-navy-800/70 dark:text-cream-50/70 whitespace-nowrap shrink-0">
                  {formatCurrency(a.monthlyFee)}/mês
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
