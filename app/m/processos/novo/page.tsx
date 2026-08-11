// MobileNewCaseForm chama createCaseMobile direto (client component -> server action) — mesmo
// motivo do maxDuration em app/(app)/processos/novo/page.tsx: vários anexos finalizados em
// sequência podem passar dos 10s padrão da Vercel.
export const maxDuration = 60;

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getDriveStatus } from "@/lib/googleDrive";
import { Card } from "@/components/ui";
import MobileNewCaseForm from "@/components/mobile/MobileNewCaseForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileNewCasePage({
  searchParams,
}: {
  searchParams: { type?: string; processNumber?: string; assessoriaId?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  // tribunais: catálogo global (não tem officeId), buscado junto para alimentar o
  // TribunalFields do formulário — mesma consulta usada na versão desktop de Novo Processo.
  const [clients, users, assessoriasRaw, tribunais, driveStatus] = await Promise.all([
    prisma.client.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    // Só assessorias ATIVAS entram na lista — MAS a assessoria de origem entra sempre, mesmo
    // suspensa ou encerrada. Sem essa exceção, quem clicava "Novo processo"/"Novo caso" de
    // dentro de uma assessoria não-ATIVA via o seletor sumir e o vínculo se perdia no submit,
    // sem erro nenhum (mesmo bug corrigido em app/(app)/processos/novo/page.tsx — ver
    // components/AssessoriaSelect.tsx).
    prisma.assessoria.findMany({
      where: {
        officeId: viewer.officeId,
        ...(searchParams.assessoriaId
          ? { OR: [{ status: "ATIVA" }, { id: searchParams.assessoriaId }] }
          : { status: "ATIVA" }),
      },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.tribunal.findMany({ orderBy: [{ categoria: "asc" }, { ordem: "asc" }] }),
    getDriveStatus(viewer.officeId),
  ]);
  // `status` vai junto para o seletor poder marcar "(Suspensa)"/"(Encerrada)" na assessoria de
  // origem — sem isso ela apareceria com o nome certo mas sem sinal nenhum de que não está ativa.
  const assessorias = assessoriasRaw.map((a) => ({ id: a.id, clientName: a.client.name, status: a.status }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/publicacoes" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Publicações
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Novo Processo/Caso</h1>
        <p className="text-sm text-tx-2">Cadastre um novo card — ele aparece na Agenda e no Kanban conforme tarefas forem criadas</p>
      </div>

      <Card className="p-4">
        <MobileNewCaseForm
          clients={clients}
          users={users}
          assessorias={assessorias}
          tribunais={tribunais}
          defaultType={searchParams.type || "JUDICIAL"}
          defaultProcessNumber={searchParams.processNumber || ""}
          defaultAssessoriaId={searchParams.assessoriaId || ""}
          driveConnected={driveStatus.connected}
        />
      </Card>
    </div>
  );
}
