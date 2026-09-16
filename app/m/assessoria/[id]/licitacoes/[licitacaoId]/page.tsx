import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getStorageConnectionStatus } from "@/lib/storageProvider";
import MobileLicitacaoDetail from "@/components/mobile/MobileLicitacaoDetail";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LicitacaoMobilePage({ params }: { params: { id: string; licitacaoId: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessoria = await getAssessoriaDetail(params.id);
  if (!assessoria) notFound();

  const licitacao = assessoria.licitacoes.find((l) => l.id === params.licitacaoId);
  if (!licitacao) notFound();

  const [users, storageStatus] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getStorageConnectionStatus(viewer.officeId),
  ]);

  return (
    <div className="p-4 space-y-1 animate-fade-in">
      <Link href={`/m/assessoria/${assessoria.id}`} className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Licitações
      </Link>
      <div className="pt-2">
        <MobileLicitacaoDetail
          assessoriaId={assessoria.id}
          licitacao={licitacao}
          users={users}
          driveConnected={storageStatus.connected}
          storageMessage={storageStatus.message}
          viewerOfficeId={viewer.officeId}
        />
      </div>
    </div>
  );
}
