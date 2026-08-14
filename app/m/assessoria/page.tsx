import Link from "next/link";
import { notFound } from "next/navigation";
import { listAssessorias } from "@/lib/actions/assessoria";
import { getCurrentUser } from "@/lib/currentUser";
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
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessorias = await listAssessorias();

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Assessoria Jurídica</h1>
        <p className="text-sm text-tx-2">
          {assessorias.length} empresa(s) com contrato de assessoria contínua
        </p>
      </div>

      <Card>
        {assessorias.length === 0 ? (
          <EmptyState title="Nenhuma empresa em assessoria ainda" subtitle="Cadastre pelo computador em Assessoria Jurídica" />
        ) : (
          <div className="divide-y divide-regua">
            {assessorias.map((a) => (
              <Link
                key={a.id}
                href={`/m/assessoria/${a.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-sf-apoio transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-tx truncate">{a.client.name}</p>
                    <Badge color={statusColors[a.status] || "slate"}>{statusLabels[a.status] || a.status}</Badge>
                  </div>
                  <p className="text-xs text-tx-2 mt-0.5">
                    {a._count.documents} documento(s) · {a._count.licitacoes} licitação(ões)
                  </p>
                </div>
                <span className="text-xs font-semibold text-tx-2 whitespace-nowrap shrink-0">
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
