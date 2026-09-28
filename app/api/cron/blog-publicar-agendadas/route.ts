import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Publica matérias do blog jurídico cujo agendamento (docs/agentes/robo-news-juridico-firecrawl.md,
// Parte A4) já venceu. Roda a cada 15 minutos (vercel.json) — daí a tolerância de "até 15 minutos
// de atraso" citada nos critérios de aceite da especificação.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const agora = new Date();
  const vencidas = await prisma.blogPost.findMany({
    where: { status: "AGENDADO", agendadaPara: { lte: agora }, excluidaEm: null },
    select: { id: true, slug: true, agendadaPara: true },
  });

  let publicadas = 0;
  for (const post of vencidas) {
    // publishedAt = agendadaPara (não `agora`): a data pública da matéria é a que o admin
    // escolheu, não o instante em que o cron passou a rodar depois dela.
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { status: "PUBLICADO", publishedAt: post.agendadaPara ?? agora, agendadaPara: null },
    });
    revalidatePath(`/blog/${post.slug}`);
    publicadas++;
  }
  if (publicadas > 0) revalidatePath("/blog");

  return NextResponse.json({ publicadas }, { status: 200 });
}
