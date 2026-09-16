import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import PeticionarWorkspace from "@/components/PeticionarWorkspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Espaço de peticionamento — Lúmen" };

// Página enxuta, sem Sidebar/TopBar de propósito — pensada pra abrir numa aba/janela ao
// lado do timbrado durante o peticionamento (ver components/PeticionarButton.tsx).

// Resolve o título do que está sendo peticionado a partir do vínculo que o wizard passou na URL
// (components/PeticionarWizard.tsx → urlDoEspaco). A URL leva só o id: o nome do cliente é
// resolvido AQUI, no servidor, e nunca aparece na barra de endereço nem no histórico do navegador.
//
// Toda consulta é filtrada por officeId — esta página é autenticada, mas um id de outro escritório
// colado na URL à mão não pode render título nenhum.
async function tituloDoVinculo(
  officeId: string,
  tipo: string | undefined,
  id: string | undefined,
): Promise<{ rotulo: string; titulo: string; href: string } | null> {
  if (!tipo || !id) return null;
  if (tipo === "caso") {
    const c = await prisma.case.findFirst({
      where: { id, officeId },
      select: { title: true, processNumber: true },
    });
    return c
      ? { rotulo: c.processNumber ? "Processo" : "Caso", titulo: c.processNumber ? `${c.title} — ${c.processNumber}` : c.title, href: `/processos/${id}` }
      : null;
  }
  if (tipo === "atendimento") {
    const a = await prisma.attendance.findFirst({ where: { id, officeId }, select: { clientName: true, subject: true } });
    return a ? { rotulo: "Atendimento", titulo: `${a.clientName} — ${a.subject}`, href: `/atendimento/${id}` } : null;
  }
  if (tipo === "assessoria") {
    const a = await prisma.assessoria.findFirst({ where: { id, officeId }, select: { client: { select: { name: true } } } });
    return a ? { rotulo: "Assessoria", titulo: a.client.name, href: `/assessoria/${id}` } : null;
  }
  if (tipo === "licitacao") {
    const l = await prisma.licitacao.findFirst({
      where: { id, officeId },
      select: { modalidade: true, orgao: true, assessoriaId: true },
    });
    return l
      ? { rotulo: "Licitação", titulo: [l.modalidade, l.orgao].filter(Boolean).join(" — ") || "Licitação", href: `/assessoria/${l.assessoriaId}?tab=licitacoes` }
      : null;
  }
  return null;
}

export default async function PeticionarPage({
  searchParams,
}: {
  searchParams: { tipo?: string; id?: string };
}) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  const vinculo = await tituloDoVinculo(user.officeId, searchParams.tipo, searchParams.id);

  return <PeticionarWorkspace vinculo={vinculo} />;
}
