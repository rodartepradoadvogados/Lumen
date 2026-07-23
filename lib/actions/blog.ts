"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { hasBlogAccess } from "@/lib/officeModules";

const VALID_TYPES = ["NOTICIA", "ANALISE"];

// Só admin de um escritório com acesso ao Blog (hoje, só o Rodarte Prado) pode produzir,
// editar ou aprovar matérias — ver comentário de Office.blogAccess no schema.
async function assertBlogAdmin() {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Sem permissão." as const };
  if (!(await hasBlogAccess(viewer.officeId))) return { error: "Recurso não disponível para este escritório." as const };
  return { viewer };
}

// Edita o rascunho antes de confirmar/publicar (título, área, tipo, resumo,
// conteúdo e/ou a URL da imagem — a imagem é sempre adicionada manualmente
// pelo admin, o robô nunca envia imagem).
export async function updateBlogPostDraft(
  id: string,
  data: { title?: string; area?: string; type?: string; summary?: string; content?: string; imageUrl?: string }
): Promise<{ error?: string }> {
  const guard = await assertBlogAdmin();
  if (guard.error) return { error: guard.error };
  const viewer = guard.viewer;

  const post = await prisma.blogPost.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!post) return { error: "Matéria não encontrada." };

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) {
    const title = data.title.trim();
    if (!title) return { error: "O título não pode ficar vazio." };
    updateData.title = title;
  }
  if (data.area !== undefined) {
    const area = data.area.trim();
    if (!area) return { error: "A área não pode ficar vazia." };
    updateData.area = area;
  }
  if (data.type !== undefined) {
    if (!VALID_TYPES.includes(data.type)) return { error: "Tipo inválido." };
    updateData.type = data.type;
  }
  if (data.summary !== undefined) {
    const summary = data.summary.trim();
    if (!summary) return { error: "O resumo não pode ficar vazio." };
    updateData.summary = summary;
  }
  if (data.content !== undefined) {
    const content = data.content.trim();
    if (!content) return { error: "O conteúdo não pode ficar vazio." };
    updateData.content = content;
  }
  if (data.imageUrl !== undefined) {
    updateData.imageUrl = data.imageUrl.trim() || null;
  }

  await prisma.blogPost.update({ where: { id }, data: updateData });
  revalidatePath("/configuracoes");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return {};
}

// Confirma/publica a matéria — fica visível para o público em /blog.
export async function publishBlogPost(id: string, imageUrl?: string): Promise<{ error?: string }> {
  const guard = await assertBlogAdmin();
  if (guard.error) return { error: guard.error };
  const viewer = guard.viewer;

  const post = await prisma.blogPost.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!post) return { error: "Matéria não encontrada." };

  await prisma.blogPost.update({
    where: { id },
    data: {
      status: "PUBLICADO",
      publishedAt: new Date(),
      reviewedById: viewer.id,
      reviewedAt: new Date(),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl.trim() || null } : {}),
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return {};
}

// Rejeita o rascunho — não é publicado.
export async function rejectBlogPost(id: string, reason?: string): Promise<{ error?: string }> {
  const guard = await assertBlogAdmin();
  if (guard.error) return { error: guard.error };
  const viewer = guard.viewer;

  const post = await prisma.blogPost.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!post) return { error: "Matéria não encontrada." };

  await prisma.blogPost.update({
    where: { id },
    data: {
      status: "REJEITADO",
      rejectedReason: reason?.trim() || null,
      reviewedById: viewer.id,
      reviewedAt: new Date(),
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/blog");
  return {};
}

// Troca a foto de banner de uma matéria já publicada (não passa pelo fluxo de
// revisão de novo, só atualiza a imagem exibida em /blog e /blog/[slug]).
export async function updatePublishedPostImage(id: string, imageUrl: string): Promise<{ error?: string }> {
  const guard = await assertBlogAdmin();
  if (guard.error) return { error: guard.error };
  const viewer = guard.viewer;

  const post = await prisma.blogPost.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!post) return { error: "Matéria não encontrada." };

  await prisma.blogPost.update({ where: { id }, data: { imageUrl: imageUrl.trim() || null } });
  revalidatePath("/configuracoes");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return {};
}

// Despublica uma matéria já confirmada — volta para a fila de revisão pendente.
export async function unpublishBlogPost(id: string): Promise<{ error?: string }> {
  const guard = await assertBlogAdmin();
  if (guard.error) return { error: guard.error };
  const viewer = guard.viewer;

  const post = await prisma.blogPost.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!post) return { error: "Matéria não encontrada." };

  await prisma.blogPost.update({
    where: { id },
    data: {
      status: "AGUARDANDO_REVISAO",
      publishedAt: null,
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return {};
}
