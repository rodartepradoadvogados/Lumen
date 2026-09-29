"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos } from "@/lib/acessoAtendimento";
import {
  FRASES_DAS_RESPOSTAS,
  LIMITE_DE_RESPOSTAS_POR_ESCRITORIO,
  ordenarRespostas,
  podeMexerNaResposta,
  validarResposta,
  type RespostaRapidaDaTela,
} from "@/lib/respostasRapidas";

// RESPOSTAS RÁPIDAS (PR 10). Toda ação começa pela sessão E pelo acesso ao Atendimento (`podeVerAtendimentos`), e
// TODA consulta leva `officeId` do viewer: a resposta de outro escritório não existe aqui. Editar e excluir:
// o autor ou o nível total (lib/respostasRapidas.ts:podeMexerNaResposta), conferido ANTES de gravar.
// A escrita usa `updateMany`/`deleteMany` com `officeId` no WHERE: mesmo que o id seja de outro escritório, nada
// é tocado.

type Quem = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function quemPode(): Promise<{ erro: string } | { erro?: undefined; viewer: Quem }> {
  const viewer = await getCurrentUser();
  if (!viewer || !podeVerAtendimentos(viewer)) return { erro: FRASES_DAS_RESPOSTAS.semAcesso };
  return { viewer };
}

const CAMPOS = { id: true, titulo: true, texto: true, criadaPorId: true } as const;

export async function listarRespostasRapidas(): Promise<{ erro: string } | { erro?: undefined; itens: RespostaRapidaDaTela[] }> {
  const r = await quemPode();
  if (r.erro !== undefined) return { erro: r.erro };
  const linhas = await prisma.respostaRapida.findMany({ where: { officeId: r.viewer.officeId }, select: CAMPOS, take: LIMITE_DE_RESPOSTAS_POR_ESCRITORIO });
  return { itens: ordenarRespostas(linhas).map((l) => ({ id: l.id, titulo: l.titulo, texto: l.texto, podeEditar: podeMexerNaResposta(r.viewer, l.criadaPorId) })) };
}

export async function salvarRespostaRapida(entrada: { id?: string; titulo: string; texto: string }): Promise<{ erro: string } | { erro?: undefined; item: RespostaRapidaDaTela }> {
  const r = await quemPode();
  if (r.erro !== undefined) return { erro: r.erro };
  const { viewer } = r;
  const v = validarResposta(entrada);
  if (!v.ok) return { erro: v.erro };

  const repetida = await prisma.respostaRapida.findFirst({
    where: { officeId: viewer.officeId, titulo: { equals: v.dados.titulo, mode: "insensitive" }, ...(entrada.id ? { NOT: { id: entrada.id } } : {}) },
    select: { id: true },
  });
  if (repetida) return { erro: FRASES_DAS_RESPOSTAS.repetida };

  if (!entrada.id) {
    if ((await prisma.respostaRapida.count({ where: { officeId: viewer.officeId } })) >= LIMITE_DE_RESPOSTAS_POR_ESCRITORIO) return { erro: FRASES_DAS_RESPOSTAS.cheio };
    const criada = await prisma.respostaRapida.create({ data: { officeId: viewer.officeId, ...v.dados, criadaPorId: viewer.id }, select: CAMPOS });
    revalidatePath("/atendimento-app/respostas-rapidas");
    return { item: { id: criada.id, titulo: criada.titulo, texto: criada.texto, podeEditar: true } };
  }

  const atual = await prisma.respostaRapida.findFirst({ where: { id: entrada.id, officeId: viewer.officeId }, select: CAMPOS });
  if (!atual) return { erro: FRASES_DAS_RESPOSTAS.naoEncontrada };
  if (!podeMexerNaResposta(viewer, atual.criadaPorId)) return { erro: FRASES_DAS_RESPOSTAS.semPermissao };
  const n = await prisma.respostaRapida.updateMany({ where: { id: atual.id, officeId: viewer.officeId }, data: v.dados });
  if (n.count === 0) return { erro: FRASES_DAS_RESPOSTAS.naoEncontrada };
  revalidatePath("/atendimento-app/respostas-rapidas");
  return { item: { id: atual.id, ...v.dados, podeEditar: true } };
}

export async function excluirRespostaRapida(id: string): Promise<{ erro?: string }> {
  const r = await quemPode();
  if (r.erro !== undefined) return { erro: r.erro };
  const { viewer } = r;
  if (typeof id !== "string" || !id) return { erro: FRASES_DAS_RESPOSTAS.naoEncontrada };
  const atual = await prisma.respostaRapida.findFirst({ where: { id, officeId: viewer.officeId }, select: CAMPOS });
  if (!atual) return { erro: FRASES_DAS_RESPOSTAS.naoEncontrada };
  if (!podeMexerNaResposta(viewer, atual.criadaPorId)) return { erro: FRASES_DAS_RESPOSTAS.semPermissao };
  await prisma.respostaRapida.deleteMany({ where: { id: atual.id, officeId: viewer.officeId } });
  revalidatePath("/atendimento-app/respostas-rapidas");
  return {};
}
