"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos, whereDoAtendimento } from "@/lib/acessoAtendimento";
import { getOfficeModules } from "@/lib/officeModules";
import { naturezaOf, NATUREZA_LABELS } from "@/lib/caseNatureza";
import type { TipoDeDestino } from "@/lib/caixaDeAnexos";

// A CAIXA DE ANEXOS (DESIGN.md §10) — o que o assistente pergunta ao servidor.
//
// Só LEITURA: achar o destino (passo "Qual") e descrever o da tela atual (atalho "Anexar aqui"). O
// envio continua pelos caminhos que já existem e já conferem tudo de novo no servidor
// (lib/actions/attachments.ts:finalizeAttachmentUpload e app/api/assessoria/documentos/upload).
// Cada busca usa o MESMO recorte desses caminhos — escritório sempre; atendimento só para quem
// pode ver atendimentos e só os que essa pessoa vê (whereDoAtendimento); assessoria só com o
// módulo contratado. Mostrar aqui um destino que o envio recusaria seria prometer e falhar.

export type ItemDeDestino = {
  id: string;
  /** Processo e caso dividem o modelo; o assistente precisa saber qual é para rotular. */
  tipo: TipoDeDestino;
  titulo: string;
  apoio: string;
  marca: string;
};

const LIMITE = 12;
const contem = (q: string) => ({ contains: q, mode: "insensitive" as const });

function itemDoCaso(c: { id: string; title: string; type: string; processNumber: string | null; court: string | null; area: string | null; client: { name: string } | null }): ItemDeDestino {
  const natureza = naturezaOf(c.type);
  return {
    id: c.id,
    tipo: natureza === "CASO" ? "caso" : "processo",
    titulo: c.title,
    apoio: [c.client?.name, c.court || c.area].filter(Boolean).join(" · "),
    marca: c.processNumber || NATUREZA_LABELS[natureza],
  };
}

const SELECT_DO_CASO = { id: true, title: true, type: true, processNumber: true, court: true, area: true, client: { select: { name: true } } } as const;

/** O passo "Qual": os registros deste tipo que combinam com a busca (vazia = os mais recentes). */
export async function buscarDestinos(tipo: TipoDeDestino, busca: string): Promise<{ itens: ItemDeDestino[]; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { itens: [], error: "Sessão expirada. Faça login novamente." };
  const q = busca.trim().slice(0, 80);

  if (tipo === "processo" || tipo === "caso") {
    const casos = await prisma.case.findMany({
      where: {
        officeId: user.officeId,
        type: tipo === "processo" ? { in: ["JUDICIAL", "ADMINISTRATIVO"] } : { notIn: ["JUDICIAL", "ADMINISTRATIVO"] },
        ...(q ? { OR: [{ title: contem(q) }, { processNumber: contem(q) }, { client: { name: contem(q) } }] } : {}),
      },
      select: SELECT_DO_CASO,
      orderBy: { updatedAt: "desc" },
      take: LIMITE,
    });
    return { itens: casos.map(itemDoCaso) };
  }

  if (tipo === "atendimento") {
    if (!podeVerAtendimentos(user)) return { itens: [] };
    const lista = await prisma.attendance.findMany({
      where: {
        ...whereDoAtendimento(user),
        status: { not: "RASCUNHO" },
        ...(q ? { OR: [{ clientName: contem(q) }, { subject: contem(q) }] } : {}),
      },
      select: { id: true, clientName: true, subject: true, stage: true },
      orderBy: { ultimaAtividadeEm: "desc" },
      take: LIMITE,
    });
    return { itens: lista.map((a) => ({ id: a.id, tipo: "atendimento" as const, titulo: a.clientName, apoio: a.subject, marca: "Atendimento" })) };
  }

  const modulos = await getOfficeModules(user.officeId);
  if (!modulos.assessoria) return { itens: [] };
  const assessorias = await prisma.assessoria.findMany({
    where: { officeId: user.officeId, status: "ATIVA", ...(q ? { client: { name: contem(q) } } : {}) },
    select: { id: true, client: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: LIMITE,
  });
  return { itens: assessorias.map((a) => ({ id: a.id, tipo: "assessoria" as const, titulo: a.client.name, apoio: "Assessoria jurídica", marca: "Ativa" })) };
}

/** O atalho "Anexar aqui": descreve o registro da tela atual, se esta pessoa pode anexar nele. */
export async function descreverDestino(tipo: "processo" | "atendimento" | "assessoria", id: string): Promise<ItemDeDestino | null> {
  const user = await getCurrentUser();
  if (!user || !id) return null;
  if (tipo === "processo") {
    const c = await prisma.case.findFirst({ where: { id, officeId: user.officeId }, select: SELECT_DO_CASO });
    return c ? itemDoCaso(c) : null;
  }
  if (tipo === "atendimento") {
    if (!podeVerAtendimentos(user)) return null;
    const a = await prisma.attendance.findFirst({ where: { id, ...whereDoAtendimento(user) }, select: { id: true, clientName: true, subject: true } });
    return a ? { id: a.id, tipo: "atendimento", titulo: a.clientName, apoio: a.subject, marca: "Atendimento" } : null;
  }
  const modulos = await getOfficeModules(user.officeId);
  if (!modulos.assessoria) return null;
  const s = await prisma.assessoria.findFirst({ where: { id, officeId: user.officeId }, select: { id: true, client: { select: { name: true } } } });
  return s ? { id: s.id, tipo: "assessoria", titulo: s.client.name, apoio: "Assessoria jurídica", marca: "Assessoria" } : null;
}

/** Dentro de uma assessoria: os pareceres (demandas) e as licitações, para o passo "Qual". */
export async function partesDaAssessoria(
  assessoriaId: string,
): Promise<{ pareceres: { id: string; nome: string }[]; licitacoes: { id: string; nome: string; status: string }[] }> {
  const user = await getCurrentUser();
  const vazio = { pareceres: [], licitacoes: [] };
  if (!user) return vazio;
  const a = await prisma.assessoria.findFirst({ where: { id: assessoriaId, officeId: user.officeId }, select: { id: true } });
  if (!a) return vazio;
  const [pareceres, licitacoes] = await Promise.all([
    prisma.parecer.findMany({ where: { assessoriaId, officeId: user.officeId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.licitacao.findMany({ where: { assessoriaId, officeId: user.officeId }, select: { id: true, nome: true, objeto: true, status: true }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return {
    pareceres: pareceres.map((p) => ({ id: p.id, nome: p.name })),
    licitacoes: licitacoes.map((l) => ({ id: l.id, nome: l.nome || l.objeto, status: l.status })),
  };
}
