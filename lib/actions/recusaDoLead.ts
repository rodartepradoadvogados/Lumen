"use server";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos, filtroDoAtendimento, SEM_ACESSO_AO_ATENDIMENTO } from "@/lib/acessoAtendimento";
import { TAMANHO_DO_TOKEN } from "@/lib/recusaDoLead";
import { motivosDoEscritorio } from "@/lib/motivosDeRecusa";
import { lerPeriodoEmBrasilia } from "@/lib/horaDeBrasilia";

// ============================================================================
// RECUSAR UM LEAD.
//
// É UM ATO DELIBERADO, e não um efeito de mover o funil para "Perdido". A decisão do dono foi
// essa, e a razão é a de sempre nesta história: a recusa serve como prova de que o escritório não
// assumiu o caso, e prova precisa de data e intenção. Automático vira carimbo, e carimbo
// automático não defende ninguém.
//
// A CARTA NASCE PRONTA E NÃO SAI SOZINHA. Gerar o link é parte de recusar; mandar é um segundo
// ato, de uma pessoa. Ninguém recusa dez leads por minuto — a economia de automatizar o envio é
// zero, e o risco de mandar a carta errada para a pessoa errada é alto.
//
// O MOTIVO É CONGELADO NO TEXTO ao gravar. O catálogo muda; a carta que o lead recebeu, não.
// ============================================================================

function recarregar(attendanceId: string) {
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${attendanceId}`);
  revalidatePath("/atendimento/funil");
  revalidatePath("/m/atendimento");
  revalidatePath(`/m/atendimento/${attendanceId}`);
}

async function quemPodeMexer(attendanceId: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: "Sessão expirada. Faça login novamente." as const };
  if (!podeVerAtendimentos(viewer)) return { erro: SEM_ACESSO_AO_ATENDIMENTO };
  const atendimento = await prisma.attendance.findFirst({
    where: { id: attendanceId, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    select: { id: true, status: true, clientName: true },
  });
  if (!atendimento) return { erro: "Atendimento não encontrado." as const };
  return { viewer, atendimento };
}

/** Os motivos que a janela de recusa oferece — os dois andares, resolvidos (ver lib/motivosDeRecusa.ts). */
export async function motivosParaRecusar(): Promise<{ id: string; rotulo: string }[]> {
  const viewer = await getCurrentUser();
  if (!viewer || !podeVerAtendimentos(viewer)) return [];
  const catalogo = await prisma.motivoDeRecusa.findMany({
    where: { OR: [{ officeId: null }, { officeId: viewer.officeId }] },
    select: { id: true, officeId: true, baseId: true, rotulo: true, descricao: true, desativado: true, ordem: true },
    orderBy: { ordem: "asc" },
  });
  return motivosDoEscritorio(catalogo, viewer.officeId).map((m) => ({ id: m.id, rotulo: m.rotulo }));
}

export async function recusarLead(
  attendanceId: string,
  dados: { motivoId?: string; motivoLivre?: string; observacao?: string; revisitaEm?: string }
): Promise<{ erro?: string; token?: string }> {
  const r = await quemPodeMexer(attendanceId);
  if ("erro" in r) return { erro: r.erro };
  if (r.atendimento.status === "CONVERTIDO") return { erro: "Este atendimento já virou processo — não há o que recusar." };

  // O texto do motivo: do catálogo, ou escrito à mão na hora. Um dos dois tem de existir — recusa
  // sem motivo é exatamente o que este fluxo inteiro existe para não acontecer.
  let motivoTexto = (dados.motivoLivre || "").replace(/\s+/g, " ").trim();
  let motivoId: string | null = null;
  if (dados.motivoId) {
    const escolhido = await prisma.motivoDeRecusa.findFirst({
      where: { id: dados.motivoId, OR: [{ officeId: null }, { officeId: r.viewer.officeId }], desativado: false },
      select: { id: true, rotulo: true },
    });
    if (!escolhido) return { erro: "Motivo não encontrado." };
    motivoId = escolhido.id;
    motivoTexto = escolhido.rotulo;
  }
  if (!motivoTexto) return { erro: "Escolha ou escreva o motivo da recusa." };

  // A data do radar é um DIA escolhido num campo de data, então é lida como dia de Brasília — e
  // não como instante, que jogaria a revisita para o dia anterior.
  let revisitaEm: Date | null = null;
  if (dados.revisitaEm?.trim()) {
    const periodo = lerPeriodoEmBrasilia(dados.revisitaEm.trim());
    if (!periodo) return { erro: "Data de revisita inválida." };
    revisitaEm = periodo.de;
  }

  const token = randomBytes(TAMANHO_DO_TOKEN / 2).toString("hex");

  await prisma.$transaction([
    prisma.recusaDeAtendimento.create({
      data: {
        attendanceId: r.atendimento.id,
        officeId: r.viewer.officeId,
        motivoId,
        motivoTexto,
        observacao: dados.observacao?.trim() || null,
        recusadaPorId: r.viewer.id,
        porAgente: false,
        token,
        revisitaEm,
      },
    }),
    // O lead sai das listas ativas, mas NÃO vira "arquivado": arquivado é o fim da linha, recusado
    // é uma decisão que pode ser revista. São coisas diferentes e precisam de palavras diferentes.
    prisma.attendance.update({ where: { id: r.atendimento.id }, data: { status: "RECUSADO" } }),
  ]);

  recarregar(r.atendimento.id);
  return { token };
}

/** Carimba que uma pessoa mandou o link. Não manda por ela — quem manda escolhe o canal e a hora. */
export async function marcarCartaEnviada(recusaId: string): Promise<{ erro?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { erro: SEM_ACESSO_AO_ATENDIMENTO };
  const recusa = await prisma.recusaDeAtendimento.findFirst({
    where: { id: recusaId, officeId: viewer.officeId, attendance: { is: filtroDoAtendimento(viewer, viewer.id) } },
    select: { id: true, attendanceId: true, enviadaEm: true },
  });
  if (!recusa) return { erro: "Recusa não encontrada." };
  // Só a PRIMEIRA vez: o que a carta prova é quando o escritório deu ciência, e regravar a cada
  // clique transformaria essa data na data do último clique de alguém arrumando a tela.
  if (!recusa.enviadaEm) {
    await prisma.recusaDeAtendimento.update({ where: { id: recusa.id }, data: { enviadaEm: new Date() } });
  }
  recarregar(recusa.attendanceId);
  return {};
}

/**
 * Registra que o lead abriu a carta.
 *
 * Chamada da página pública, sem sessão nenhuma — e por isso ela é deliberadamente burra: recebe
 * um token, carimba, e não devolve nada que sirva para descobrir se um token existe. A página já
 * responde 404 para token inválido; esta função não pode virar um segundo jeito de perguntar.
 */
export async function registrarAberturaDaCarta(token: string): Promise<void> {
  await prisma.recusaDeAtendimento.updateMany({
    where: { token, abertaEm: null },
    data: { abertaEm: new Date() },
  });
  await prisma.recusaDeAtendimento.updateMany({ where: { token }, data: { aberturas: { increment: 1 } } });
}
