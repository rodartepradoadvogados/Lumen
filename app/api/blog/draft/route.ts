import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["NOTICIA", "ANALISE"];

// Gera um slug em kebab-case sem acentos a partir do título, com um sufixo
// curto para evitar colisão entre matérias com títulos parecidos/iguais.
function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  return `${base || "materia"}-${suffix}`;
}

// Recebe rascunhos de matérias produzidos pelo robô de conteúdo EXTERNO
// (outro projeto Claude Code, autônomo). Autenticação simples por Bearer token
// comparado a BLOG_ROBOT_SECRET — mesmo estilo de checagem usado no cron do
// Jusbrasil (app/api/cron/jusbrasil-sync/route.ts), mas aqui a ausência da env
// var também é tratada como não autorizado (não há bypass em produção).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.BLOG_ROBOT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido no corpo da requisição." }, { status: 400 });
  }

  const data = body as {
    title?: unknown;
    area?: unknown;
    type?: unknown;
    summary?: unknown;
    content?: unknown;
    sources?: unknown;
  };

  const title = typeof data.title === "string" ? data.title.trim() : "";
  const area = typeof data.area === "string" ? data.area.trim() : "";
  const summary = typeof data.summary === "string" ? data.summary.trim() : "";
  const content = typeof data.content === "string" ? data.content.trim() : "";

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!area) missing.push("area");
  if (!summary) missing.push("summary");
  if (!content) missing.push("content");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Campo(s) obrigatório(s) ausente(s): ${missing.join(", ")}.` },
      { status: 400 }
    );
  }

  const type = typeof data.type === "string" && VALID_TYPES.includes(data.type) ? data.type : "NOTICIA";

  let sources: string | null = null;
  if (Array.isArray(data.sources)) {
    const cleaned = data.sources.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
    if (cleaned.length > 0) sources = cleaned.join("\n");
  }

  const slug = slugify(title);

  const post = await prisma.blogPost.create({
    data: {
      slug,
      title,
      area,
      type,
      summary,
      content,
      sources,
      status: "AGUARDANDO_REVISAO",
    },
  });

  return NextResponse.json({ id: post.id, slug: post.slug, status: post.status }, { status: 201 });
}
