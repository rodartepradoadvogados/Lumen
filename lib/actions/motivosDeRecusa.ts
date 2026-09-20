"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isPlatformStaff } from "@/lib/platformMember";
import { rotuloValido, motivosDoEscritorio, type MotivoBruto } from "@/lib/motivosDeRecusa";

// ============================================================================
// O CATÁLOGO DE MOTIVOS — AS AÇÕES.
//
// Dois donos, duas portas. A Lúmen mexe nos padrões (isPlatformStaff); o escritório mexe na camada
// dele (administrador do escritório). Nenhuma das duas portas abre a outra: um administrador de
// escritório editando um motivo-padrão mudaria a carta de todos os outros escritórios.
//
// O PERIGO QUE MORA AQUI, e não no módulo puro: SELECIONAR não pode criar linha. A regra de que o
// escritório recebe as correções da Lúmen depende inteiramente de ele NÃO ter cópia — e a maneira
// natural de escrever uma tela de catálogo é "ao marcar, grava". Se alguém escrever isso aqui, o
// módulo puro continua certo, os testes dele continuam passando, e o catálogo apodrece em silêncio.
// A linha da camada só nasce em editarMotivo e desativarMotivo. Há varredura provando isso em
// lib/testes/motivos.teste.ts.
// ============================================================================

async function donoDoEscritorio() {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: "Sessão expirada. Faça login novamente." as const };
  // Motivo de recusa é texto que sai do escritório com o nome dele. Quem edita é quem responde.
  if (!viewer.isAdmin) return { erro: "Só um administrador do escritório muda os motivos de recusa." as const };
  return { viewer };
}

function recarregar(officeId?: string) {
  revalidatePath("/configuracoes");
  revalidatePath("/atendimento");
  revalidatePath("/painel-mestre/produto");
  if (officeId) revalidatePath(`/painel-mestre/${officeId}`);
}

// ── O CATÁLOGO, JÁ RESOLVIDO ────────────────────────────────────────────────

/** Os dois andares, resolvidos para este escritório. É o que a tela de Configurações lista. */
export async function listarMotivos(): Promise<{ erro?: string; motivos?: ReturnType<typeof motivosDoEscritorio> }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: "Sessão expirada. Faça login novamente." };
  const catalogo = await lerCatalogo(viewer.officeId);
  return { motivos: motivosDoEscritorio(catalogo, viewer.officeId) };
}

/** Os dois andares crus. Só o que interessa: o da plataforma mais o deste escritório. */
async function lerCatalogo(officeId: string): Promise<MotivoBruto[]> {
  const linhas = await prisma.motivoDeRecusa.findMany({
    where: { OR: [{ officeId: null }, { officeId }] },
    select: { id: true, officeId: true, baseId: true, rotulo: true, descricao: true, desativado: true, ordem: true },
    orderBy: { ordem: "asc" },
  });
  return linhas;
}

// ── O LADO DA PLATAFORMA (Painel Mestre) ────────────────────────────────────

export async function criarMotivoPadrao(rotuloBruto: string, descricao?: string): Promise<{ erro?: string; id?: string }> {
  if (!(await isPlatformStaff())) return { erro: "Só a equipe da Lúmen cadastra motivos-padrão." };
  const v = rotuloValido(rotuloBruto);
  if (!v.ok) return { erro: v.erro };

  const ultimo = await prisma.motivoDeRecusa.findFirst({ where: { officeId: null }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const criado = await prisma.motivoDeRecusa.create({
    data: { officeId: null, rotulo: v.rotulo, descricao: descricao?.trim() || null, ordem: (ultimo?.ordem ?? 0) + 1 },
  });
  recarregar();
  return { id: criado.id };
}

export async function editarMotivoPadrao(id: string, rotuloBruto: string, descricao?: string): Promise<{ erro?: string }> {
  if (!(await isPlatformStaff())) return { erro: "Só a equipe da Lúmen edita motivos-padrão." };
  const v = rotuloValido(rotuloBruto);
  if (!v.ok) return { erro: v.erro };
  // `officeId: null` no WHERE, e não só o id: sem isso esta ação viraria um jeito de a Lúmen
  // editar, sem querer, a camada de um escritório.
  await prisma.motivoDeRecusa.updateMany({
    where: { id, officeId: null },
    data: { rotulo: v.rotulo, descricao: descricao?.trim() || null },
  });
  recarregar();
  return {};
}

export async function desativarMotivoPadrao(id: string, desativado: boolean): Promise<{ erro?: string }> {
  if (!(await isPlatformStaff())) return { erro: "Só a equipe da Lúmen desativa motivos-padrão." };
  await prisma.motivoDeRecusa.updateMany({ where: { id, officeId: null }, data: { desativado } });
  recarregar();
  return {};
}

// ── O LADO DO ESCRITÓRIO ────────────────────────────────────────────────────

/** Um motivo que só este escritório tem. Sem `baseId`: não há padrão atrás, então ele some quando é excluído. */
export async function criarMotivoProprio(rotuloBruto: string, descricao?: string): Promise<{ erro?: string; id?: string }> {
  const r = await donoDoEscritorio();
  if ("erro" in r) return { erro: r.erro };
  const v = rotuloValido(rotuloBruto);
  if (!v.ok) return { erro: v.erro };

  const ultimo = await prisma.motivoDeRecusa.findFirst({
    where: { officeId: r.viewer.officeId },
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });
  const criado = await prisma.motivoDeRecusa.create({
    data: {
      officeId: r.viewer.officeId,
      rotulo: v.rotulo,
      descricao: descricao?.trim() || null,
      ordem: Math.max(ultimo?.ordem ?? 0, 100) + 1,
    },
  });
  recarregar(r.viewer.officeId);
  return { id: criado.id };
}

/**
 * Editar. É AQUI que a camada do escritório nasce, quando ele mexe num padrão pela primeira vez —
 * e é o único lugar, junto de desativar, em que ela nasce. Ver a nota no alto do arquivo.
 */
export async function editarMotivo(id: string, rotuloBruto: string, descricao?: string): Promise<{ erro?: string }> {
  const r = await donoDoEscritorio();
  if ("erro" in r) return { erro: r.erro };
  const v = rotuloValido(rotuloBruto);
  if (!v.ok) return { erro: v.erro };

  const alvo = await prisma.motivoDeRecusa.findFirst({
    where: { id, OR: [{ officeId: null }, { officeId: r.viewer.officeId }] },
    select: { id: true, officeId: true, baseId: true, ordem: true },
  });
  if (!alvo) return { erro: "Motivo não encontrado." };

  if (alvo.officeId === r.viewer.officeId) {
    await prisma.motivoDeRecusa.update({ where: { id: alvo.id }, data: { rotulo: v.rotulo, descricao: descricao?.trim() || null } });
  } else {
    // Primeira edição de um padrão: nasce a camada. `upsert` não serve porque a chave é composta
    // por officeId+baseId e não há índice único para ela — e criar um só para isso seria pagar uma
    // migração por uma corrida que não existe (duas edições simultâneas do mesmo motivo pelo mesmo
    // escritório).
    const jaTem = await prisma.motivoDeRecusa.findFirst({ where: { officeId: r.viewer.officeId, baseId: alvo.id }, select: { id: true } });
    if (jaTem) {
      await prisma.motivoDeRecusa.update({ where: { id: jaTem.id }, data: { rotulo: v.rotulo, descricao: descricao?.trim() || null, desativado: false } });
    } else {
      await prisma.motivoDeRecusa.create({
        data: { officeId: r.viewer.officeId, baseId: alvo.id, rotulo: v.rotulo, descricao: descricao?.trim() || null, ordem: alvo.ordem },
      });
    }
  }
  recarregar(r.viewer.officeId);
  return {};
}

/**
 * Tirar das telas do escritório.
 *
 * Num motivo próprio isso é exclusão de verdade. Num padrão é desativação — e aí também nasce a
 * camada, porque desativar é uma opinião do escritório sobre um motivo que não é dele.
 */
export async function removerMotivo(id: string): Promise<{ erro?: string }> {
  const r = await donoDoEscritorio();
  if ("erro" in r) return { erro: r.erro };

  const alvo = await prisma.motivoDeRecusa.findFirst({
    where: { id, OR: [{ officeId: null }, { officeId: r.viewer.officeId }] },
    select: { id: true, officeId: true, baseId: true, rotulo: true, descricao: true, ordem: true },
  });
  if (!alvo) return { erro: "Motivo não encontrado." };

  if (alvo.officeId === r.viewer.officeId && !alvo.baseId) {
    await prisma.motivoDeRecusa.delete({ where: { id: alvo.id } });
  } else if (alvo.officeId === r.viewer.officeId) {
    await prisma.motivoDeRecusa.update({ where: { id: alvo.id }, data: { desativado: true } });
  } else {
    await prisma.motivoDeRecusa.create({
      data: { officeId: r.viewer.officeId, baseId: alvo.id, rotulo: alvo.rotulo, descricao: alvo.descricao, ordem: alvo.ordem, desativado: true },
    });
  }
  recarregar(r.viewer.officeId);
  return {};
}

/**
 * Voltar ao padrão: apagar a camada. Um motivo, ou a lista inteira.
 *
 * Não existe "restaurar o texto antigo do padrão" — o padrão é o que a Lúmen tem AGORA. Apagar a
 * linha do escritório faz ele voltar a apontar para lá, e é só isso que precisa acontecer.
 */
export async function voltarAoPadrao(id: string): Promise<{ erro?: string }> {
  const r = await donoDoEscritorio();
  if ("erro" in r) return { erro: r.erro };
  // `baseId: { not: null }` é a trava: um motivo PRÓPRIO não tem padrão atrás, e apagá-lo por
  // aqui seria exclusão disfarçada de restauração.
  const apagados = await prisma.motivoDeRecusa.deleteMany({ where: { id, officeId: r.viewer.officeId, baseId: { not: null } } });
  if (apagados.count === 0) return { erro: "Este motivo não tem padrão para onde voltar." };
  recarregar(r.viewer.officeId);
  return {};
}

export async function voltarListaAoPadrao(): Promise<{ erro?: string; apagados?: number }> {
  const r = await donoDoEscritorio();
  if ("erro" in r) return { erro: r.erro };
  // Só as linhas com `baseId`: o que o escritório criou por conta própria NÃO é edição de padrão e
  // não pode ser varrido por um botão que promete restaurar.
  const apagados = await prisma.motivoDeRecusa.deleteMany({ where: { officeId: r.viewer.officeId, baseId: { not: null } } });
  recarregar(r.viewer.officeId);
  return { apagados: apagados.count };
}
