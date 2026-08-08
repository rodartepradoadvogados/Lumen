import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { effectiveCaseClients, effectiveCaseParties } from "@/lib/caseParties";
import { naturezaOf, NATUREZA_LABELS } from "@/lib/caseNatureza";
import { getCaseInstanceHistory } from "@/lib/actions/cases";
import { buildCaseTimeline } from "@/lib/caseTimeline";
import ModoReuniaoView from "@/components/reuniao/ModoReuniaoView";

export const dynamic = "force-dynamic";

// Página enxuta, sem rail/painel de seção/TopBar de propósito — pensada para abrir numa aba à
// parte e ser projetada/impressa direto na frente do cliente durante uma reunião (ver proposta
// de remodelação do portal, "Modo reunião"; botão de entrada em app/(app)/processos/[id]/
// page.tsx). Mesmo padrão de página solo autenticada que app/peticionar/page.tsx já usa.
// Só mostra o que é apresentável ao cliente: nenhum valor de honorário, nenhuma pendência
// financeira, nenhum comentário interno da equipe — ver ModoReuniaoView e o filtro de
// timelineEvents abaixo.
export default async function ModoReuniaoPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer || !viewer.active) redirect("/");

  const c = await prisma.case.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: {
      client: true,
      clients: { include: { client: true } },
      parties: true,
      responsible: true,
      tasks: { where: { status: { not: "CANCELADO" } }, include: { completedBy: true }, orderBy: { dueDate: "asc" } },
      comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
      publications: { orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }] },
      protocoloLotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();

  const office = await prisma.office.findUnique({ where: { id: viewer.officeId }, select: { name: true } });
  const instanceHistory = await getCaseInstanceHistory(c.id);
  // Comentários são anotações internas da equipe (às vezes sobre estratégia/tratativas), não
  // fazem parte do que se mostra ao cliente — mesma lista de eventos do Processo normal, só
  // filtrada.
  const timelineEvents = buildCaseTimeline(c, instanceHistory).filter((ev) => ev.kind !== "comentario");

  const nat = naturezaOf(c.type);
  const caseClients = effectiveCaseClients(c);
  const caseParties = effectiveCaseParties(c);
  const pendingTasks = c.tasks.filter((t) => t.status !== "CONCLUIDO");

  return (
    <ModoReuniaoView
      officeName={office?.name ?? ""}
      caseTitle={c.title}
      processNumber={c.processNumber}
      naturezaLabel={NATUREZA_LABELS[nat]}
      court={c.court}
      tribunal={c.tribunalSigla ? `${c.tribunalSigla} — ${c.tribunalNome ?? ""}` : null}
      responsibleName={c.responsible?.name ?? null}
      status={c.status}
      clients={caseClients.map((cc) => ({ name: cc.name, role: cc.role }))}
      parties={caseParties.map((p) => ({ name: p.name, role: p.role }))}
      pendingTasks={pendingTasks.map((t) => ({ id: t.id, title: t.title, type: t.type, dueDate: t.dueDate.toISOString() }))}
      timelineEvents={timelineEvents}
    />
  );
}
