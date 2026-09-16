import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { getCurrentUser } from "@/lib/currentUser";
import MobileParecerForm from "@/components/mobile/MobileParecerForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EditarDemandaMobilePage({ params }: { params: { id: string; parecerId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  const parecer = assessoria.pareceres.find((p) => p.id === params.parecerId);
  if (!parecer) notFound();

  return (
    <div className="animate-fade-in">
      <div className="p-4 pb-0">
        <Link href={`/m/assessoria/${assessoria.id}/pareceres/${parecer.id}`} className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
          <ArrowLeft size={13} /> Cancelar
        </Link>
        <h1 className="text-lg font-bold text-tx leading-tight mt-2">Editar demanda</h1>
      </div>
      <MobileParecerForm assessoriaId={assessoria.id} parecer={parecer} />
    </div>
  );
}
