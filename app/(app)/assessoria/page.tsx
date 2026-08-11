import Link from "next/link";
import { listAssessorias } from "@/lib/actions/assessoria";
import { PageHeader, Card, Badge, EmptyState, formatCurrency } from "@/components/ui";
import { ButtonPrimary } from "@/components/ui";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "green" | "slate" | "bordo"> = {
  ATIVA: "green",
  SUSPENSA: "slate",
  ENCERRADA: "bordo",
};
const statusLabels: Record<string, string> = { ATIVA: "Ativa", SUSPENSA: "Suspensa", ENCERRADA: "Encerrada" };

export default async function AssessoriaListPage() {
  const assessorias = await listAssessorias();

  return (
    <div className="p-6 animate-fade-in">
      <PageHeader
        title="Assessoria Jurídica"
        subtitle="Empresas com contrato de assessoria contínua — documentos, honorário mensal, licitações e histórico"
        action={
          <Link href="/assessoria/novo">
            <ButtonPrimary>
              <Plus size={15} /> Nova Assessoria
            </ButtonPrimary>
          </Link>
        }
      />

      <Card>
        {assessorias.length === 0 ? (
          <EmptyState title="Nenhuma empresa em assessoria ainda" subtitle="Clique em 'Nova Assessoria' para cadastrar a primeira" />
        ) : (
          <div className="divide-y divide-regua">
            {assessorias.map((a) => (
              <Link
                key={a.id}
                href={`/assessoria/${a.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-sf-apoio transition-colors flex-wrap"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-tx">{a.client.name}</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    {a._count.documents} documento(s) · {a._count.licitacoes} licitação(ões)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={statusColors[a.status] || "slate"}>{statusLabels[a.status] || a.status}</Badge>
                  <span className="text-sm font-semibold text-tx-2 whitespace-nowrap">
                    {formatCurrency(a.monthlyFee)}/mês
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
