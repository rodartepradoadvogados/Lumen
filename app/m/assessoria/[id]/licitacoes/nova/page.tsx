import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import MobileLicitacaoForm from "@/components/mobile/MobileLicitacaoForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NovaLicitacaoMobilePage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const assessoria = await prisma.assessoria.findFirst({ where: { id: params.id, officeId: viewer.officeId }, select: { id: true } });
  if (!assessoria) notFound();

  return (
    <div className="animate-fade-in">
      <div className="p-4 pb-0">
        <Link href={`/m/assessoria/${params.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
          <ArrowLeft size={13} /> Cancelar
        </Link>
        <h1 className="text-lg font-bold text-tx leading-tight mt-2">Nova licitação</h1>
      </div>
      <MobileLicitacaoForm assessoriaId={assessoria.id} />
    </div>
  );
}
