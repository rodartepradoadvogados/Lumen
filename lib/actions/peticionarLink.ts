"use server";

// Server Actions do wizard de vínculo do botão Peticionar (components/PeticionarWizard.tsx) —
// pedido do dono do escritório: antes de gerar a petição, perguntar onde ela deve ficar salva em
// vez de sempre cair na pasta genérica "gerados" do escritório (lib/googleDrive.ts:
// copyAndFillTemplate), sem vínculo nenhum no banco — exatamente o achado G40 da auditoria
// gauntlet (docs/gauntlet/2026-09-roteiro-de-implementacao.md), nunca corrigido até agora.
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { naturezaWhere, type CaseNatureza } from "@/lib/caseNatureza";
import { joinCaseNames, effectiveCaseClients } from "@/lib/caseParties";

export type PeticionarLinkType = "PROCESSO" | "CASO" | "ATENDIMENTO" | "ASSESSORIA" | "LICITACAO";

// O que o wizard efetivamente manda pra criarPeticao (lib/actions/peticionar.ts) — sempre um só
// dos quatro campos preenchido, ou nenhum (petição sem vínculo, comportamento de sempre).
export type PeticionarLink =
  | { caseId: string }
  | { attendanceId: string }
  | { licitacaoId: string }
  | { assessoriaId: string };

export type LinkOption = { id: string; titulo: string; subtitulo?: string };

// Passo 1 do wizard ("deseja vincular à tela atual?"): o botão global da TopBar não recebe
// caseId/attendanceId/assessoriaId nenhum (é renderizado fora de qualquer página específica), só
// sabe em que URL o usuário está (components/PeticionarWizard.tsx lê usePathname()). Esta função
// confirma que o registro existe, pertence ao escritório do usuário, e devolve um rótulo pronto
// pra pergunta de confirmação — nunca confia no id vindo da URL sem checar officeId.
export async function getScreenContextLabel(
  type: Extract<PeticionarLinkType, "PROCESSO" | "CASO" | "ATENDIMENTO" | "ASSESSORIA">,
  id: string
): Promise<{ label: string; link: PeticionarLink } | null> {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  if (type === "PROCESSO" || type === "CASO") {
    const c = await prisma.case.findFirst({ where: { id, officeId: viewer.officeId }, select: { id: true, title: true } });
    return c ? { label: c.title, link: { caseId: c.id } } : null;
  }
  if (type === "ATENDIMENTO") {
    const a = await prisma.attendance.findFirst({ where: { id, officeId: viewer.officeId }, select: { id: true, clientName: true } });
    return a ? { label: a.clientName, link: { attendanceId: a.id } } : null;
  }
  const assessoria = await prisma.assessoria.findFirst({
    where: { id, officeId: viewer.officeId },
    select: { id: true, client: { select: { name: true } } },
  });
  return assessoria ? { label: assessoria.client.name, link: { assessoriaId: assessoria.id } } : null;
}

// Passo 3→4 do wizard: depois de escolher o TIPO (Processo/Caso/Atendimento/Assessoria), busca
// dinâmica pra afunilar até o registro exato — mesmo padrão/tolerância de texto de
// lib/actions/casesSearch.ts (2+ caracteres, no máximo 8 resultados), só que unificado pros
// quatro tipos num único ponto de entrada, já que o wizard tem uma caixa de busca só.
export async function searchPeticionarLinkTargets(type: PeticionarLinkType, q: string): Promise<LinkOption[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const query = q.trim();
  if (query.length < 2) return [];

  if (type === "PROCESSO" || type === "CASO") {
    const natureza: CaseNatureza = type === "PROCESSO" ? "JUDICIAL" : "CASO";
    // "Processo" cobre Judicial e Administrativo (mesma agregação de lib/caseNatureza.ts) —
    // Administrativo também tem número e tramita em órgão, não faz sentido separar aqui.
    const where =
      natureza === "JUDICIAL"
        ? { officeId: viewer.officeId, type: { in: ["JUDICIAL", "ADMINISTRATIVO"] }, title: { contains: query, mode: "insensitive" as const } }
        : { officeId: viewer.officeId, ...naturezaWhere("CASO"), title: { contains: query, mode: "insensitive" as const } };
    const cases = await prisma.case.findMany({
      where,
      include: { client: true, clients: { include: { client: true } }, parties: true },
      orderBy: { title: "asc" },
      take: 8,
    });
    return cases.map((c) => ({
      id: c.id,
      titulo: c.title,
      subtitulo: [c.processNumber, joinCaseNames(effectiveCaseClients(c).map((cc) => cc.name))].filter(Boolean).join(" · ") || undefined,
    }));
  }

  if (type === "ATENDIMENTO") {
    const attendances = await prisma.attendance.findMany({
      where: { officeId: viewer.officeId, clientName: { contains: query, mode: "insensitive" } },
      orderBy: { clientName: "asc" },
      take: 8,
      select: { id: true, clientName: true, subject: true },
    });
    return attendances.map((a) => ({ id: a.id, titulo: a.clientName, subtitulo: a.subject || undefined }));
  }

  // ASSESSORIA e LICITACAO buscam pelo nome do cliente PJ dono da assessoria — quem procura uma
  // licitação também pensa "a licitação da empresa X", não pelo texto do edital.
  const assessorias = await prisma.assessoria.findMany({
    where: { officeId: viewer.officeId, client: { name: { contains: query, mode: "insensitive" } } },
    include: { client: true },
    orderBy: { client: { name: "asc" } },
    take: 8,
  });
  return assessorias.map((a) => ({ id: a.id, titulo: a.client.name }));
}

// Passo 5, só quando o Passo 3 escolheu Assessoria: perguntar se é documento GERAL da empresa ou
// de uma Licitação específica dela (a única sub-entidade da Assessoria que já tem pasta própria
// no Drive — ver getOrCreateLicitacaoFolder, lib/googleDrive.ts). Lista fechada (sem busca por
// texto): uma assessoria não costuma ter licitações a ponto de precisar filtrar.
export async function listLicitacoesForAssessoria(assessoriaId: string): Promise<LinkOption[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const assessoria = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: viewer.officeId }, select: { id: true } });
  if (!assessoria) return [];
  const licitacoes = await prisma.licitacao.findMany({
    where: { assessoriaId },
    orderBy: { createdAt: "desc" },
    select: { id: true, nome: true, objeto: true, modalidade: true },
  });
  return licitacoes.map((l) => ({ id: l.id, titulo: l.nome ?? l.objeto, subtitulo: l.modalidade ?? undefined }));
}
