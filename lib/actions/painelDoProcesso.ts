"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { sanitizeExternalUrl } from "@/lib/urlSafety";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";

// PAINEL RÁPIDO DO PROCESSO (a gaveta de /publicacoes): o suficiente para "dar uma olhada e voltar",
// sem sair da fila. Quatro consultas indexadas e enxutas, em vez da página inteira do processo, que
// carrega ~25 consultas (todos os processos ativos, todos os clientes, financeiro, anexos, documentos...).
// "Abrir processo" era a ação mais lenta da tela.
//
// O que NÃO traz de propósito: financeiro (honorários, parcelas), anexos, documentos, dados de
// contato. É a visão de quem está triando publicação; o resto fica na página completa, onde o acesso
// é o de sempre. O escopo é o mesmo da página do processo: por escritório (officeId).

export type PainelDoProcesso = {
  id: string;
  titulo: string;
  numero: string | null;
  status: string;
  natureza: string;
  area: string | null;
  acao: string | null;
  papelDoCliente: string | null;
  cliente: string | null;
  parteAdversa: string | null;
  responsavel: string | null;
  tribunalSigla: string | null;
  tribunalSistema: string | null;
  instancia: string | null;
  // Só existe quando o processo tem o link do tribunal cadastrado E ele é um http(s) seguro. Sem isso
  // a tela NÃO mostra "Abrir no tribunal": nunca se monta link a partir do número.
  tribunalLink: string | null;
  proximoPrazo: { titulo: string; data: string; hora: string | null } | null;
  tarefasAbertas: number;
  publicacoes: { id: string; data: string; fonte: string; tipo: string; trecho: string }[];
  tarefas: { id: string; titulo: string; tipo: string; data: string; responsavel: string | null }[];
  comentarios: { id: string; autor: string; texto: string; data: string }[];
};

const ABERTAS = ["PENDENTE", "EM_ANDAMENTO"];

export async function carregarPainelDoProcesso(caseId: string): Promise<{ error?: string; painel?: PainelDoProcesso }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  const officeId = viewer.officeId;

  const [caso, publicacoes, tarefas, comentarios, totalAbertas] = await Promise.all([
    prisma.case.findFirst({
      where: { id: caseId, officeId },
      select: {
        id: true,
        title: true,
        processNumber: true,
        status: true,
        type: true,
        area: true,
        actionType: true,
        clientRole: true,
        opposingPartyName: true,
        tribunalSigla: true,
        tribunalSistema: true,
        tribunalLink: true,
        currentInstance: true,
        client: { select: { name: true } },
        responsible: { select: { name: true } },
      },
    }),
    prisma.publication.findMany({
      where: { caseId, officeId, estado: "ATIVA" },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: { id: true, publishedAt: true, source: true, kind: true, content: true },
    }),
    prisma.task.findMany({
      where: { caseId, officeId, status: { in: ABERTAS } },
      orderBy: { dueDate: "asc" },
      take: 8,
      select: { id: true, title: true, type: true, dueDate: true, dueTime: true, responsible: { select: { name: true } } },
    }),
    prisma.comment.findMany({
      where: { caseId, officeId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, content: true, createdAt: true, author: { select: { name: true } } },
    }),
    prisma.task.count({ where: { caseId, officeId, status: { in: ABERTAS } } }),
  ]);
  if (!caso) return { error: "Processo não encontrado." };

  const proximo = tarefas.find((t) => t.type === "PRAZO") ?? null;
  return {
    painel: {
      id: caso.id,
      titulo: caso.title,
      numero: caso.processNumber,
      status: caso.status,
      natureza: caso.type,
      area: caso.area,
      acao: caso.actionType,
      papelDoCliente: caso.clientRole,
      cliente: caso.client?.name ?? null,
      parteAdversa: caso.opposingPartyName,
      responsavel: caso.responsible?.name ?? null,
      tribunalSigla: caso.tribunalSigla,
      tribunalSistema: caso.tribunalSistema,
      instancia: caso.currentInstance,
      tribunalLink: sanitizeExternalUrl(caso.tribunalLink),
      proximoPrazo: proximo ? { titulo: proximo.title, data: proximo.dueDate.toISOString().slice(0, 10), hora: proximo.dueTime } : null,
      tarefasAbertas: totalAbertas,
      publicacoes: publicacoes.map((p) => ({
        id: p.id,
        data: p.publishedAt.toISOString(),
        fonte: p.source,
        tipo: p.kind,
        trecho: decodificarEntidadesHtml(p.content).replace(/\s+/g, " ").trim().slice(0, 220),
      })),
      tarefas: tarefas.map((t) => ({
        id: t.id,
        titulo: t.title,
        tipo: t.type,
        data: t.dueDate.toISOString().slice(0, 10),
        responsavel: t.responsible?.name ?? null,
      })),
      comentarios: comentarios.map((c) => ({ id: c.id, autor: c.author.name, texto: c.content.replace(/\s+/g, " ").trim().slice(0, 200), data: c.createdAt.toISOString() })),
    },
  };
}
