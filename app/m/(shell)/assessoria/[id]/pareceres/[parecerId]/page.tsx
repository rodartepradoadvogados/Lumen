import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { getCurrentUser } from "@/lib/currentUser";
import { getStorageConnectionStatus } from "@/lib/storageProvider";
import MobileParecerDetail from "@/components/mobile/MobileParecerDetail";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ParecerMobilePage({ params }: { params: { id: string; parecerId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  const parecer = assessoria.pareceres.find((p) => p.id === params.parecerId);
  if (!parecer) notFound();

  const storageStatus = await getStorageConnectionStatus(viewer.officeId);

  return (
    <div className="p-4 space-y-1 animate-fade-in">
      <Link href={`/m/assessoria/${assessoria.id}`} className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Assessoria
      </Link>
      <div className="pt-2">
        <MobileParecerDetail
          assessoriaId={assessoria.id}
          parecer={parecer}
          storageConnected={storageStatus.connected}
          storageMessage={storageStatus.message}
        />
      </div>
    </div>
  );
}
