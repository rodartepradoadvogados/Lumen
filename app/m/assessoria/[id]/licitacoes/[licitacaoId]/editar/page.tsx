import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { getCurrentUser } from "@/lib/currentUser";
import MobileLicitacaoForm from "@/components/mobile/MobileLicitacaoForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditarLicitacaoMobilePage({ params }: { params: { id: string; licitacaoId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  const licitacao = assessoria.licitacoes.find((l) => l.id === params.licitacaoId);
  if (!licitacao) notFound();

  return (
    <div className="animate-fade-in">
      <div className="p-4 pb-0">
        <Link href={`/m/assessoria/${assessoria.id}/licitacoes/${licitacao.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
          <ArrowLeft size={13} /> Cancelar
        </Link>
        <h1 className="text-lg font-bold text-tx leading-tight mt-2">Editar licitação</h1>
      </div>
      <MobileLicitacaoForm assessoriaId={assessoria.id} licitacao={licitacao} />
    </div>
  );
}
