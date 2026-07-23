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

// Normaliza um título para comparação de duplicata: mesma lógica de acentos/
// caixa da slugify, mas sem sufixo aleatório nem limite de tamanho.
function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// Recebe rascunhos de matérias produzidos pelo robô de conteúdo EXTERNO
// (outro projeto Claude Code, autônomo). Autenticação simples por Bearer token
// comparado a BLOG_ROBOT_SECRET — mesmo estilo de checagem usado no cron do
// Jusbrasil (app/api/cron/jusbrasil-sync/route.ts), mas aqui a ausência da env
// var também é tratada como não autorizado (não há bypass em produção).

// Permite ao robô externo consultar o que já foi enviado antes de publicar de
// novo, evitando duplicatas — já que o robô roda em sessões efêmeras e não tem
// onde guardar estado local entre execuções. Devolve título/área/fontes/status
// dos últimos N dias (todos os status, inclusive REJEITADO, para não reenviar
// algo que um advogado já recusou).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.BLOG_ROBOT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // TODO(multi-tenant): mesmo stopgap de escritório único do POST abaixo —
  // ver comentário lá para o motivo e o que precisa mudar antes de suportar
  // mais de um Office.
  const office = await prisma.office.findFirst();

  const posts = await prisma.blogPost.findMany({
    where: { createdAt: { gte: since }, officeId: office?.id ?? "" },
    orderBy: { createdAt: "desc" },
    select: {
      title: true,
      area: true,
      type: true,
      sources: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ days, count: posts.length, posts });
}

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

  // Trava de duplicata no servidor: não depende do robô externo lembrar de
  // checar antes de publicar (ele já faz isso via GET, mas essa é uma segunda
  // camada, mecânica, que vale pra qualquer chamador). Considera duplicata se
  // o título normalizado bater com algo dos últimos 60 dias, em qualquer
  // status (inclusive REJEITADO — não reenviar o que já foi recusado), ou se
  // alguma fonte citada já foi usada em outra matéria (mesmo fato, título
  // reescrito de outro jeito).
  // TODO(multi-tenant): este endpoint autentica o robô externo via um único
  // BLOG_ROBOT_SECRET global, sem qualquer sinal de PARA QUAL escritório a
  // matéria se destina. Antes de este projeto suportar mais de um Office,
  // isso precisa de um mecanismo real (ex.: um secret/token por escritório).
  // Como stopgap TEMPORÁRIO e válido apenas enquanto houver um único Office
  // no banco, buscamos "o" Office existente. Isso QUEBRA/fica ambíguo assim
  // que houver mais de um escritório — precisa ser revisitado antes disso.
  const office = await prisma.office.findFirst();
  if (!office) {
    return NextResponse.json(
      { error: "Nenhum escritório (Office) cadastrado; não é possível associar a matéria." },
      { status: 500 }
    );
  }

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const recentPosts = await prisma.blogPost.findMany({
    where: { createdAt: { gte: sixtyDaysAgo }, officeId: office.id },
    select: { id: true, slug: true, title: true, sources: true, status: true, createdAt: true },
  });

  const incomingSources: string[] = Array.isArray(data.sources)
    ? data.sources.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];
  const normalizedIncomingTitle = normalizeTitle(title);

  const duplicate = recentPosts.find((p) => {
    if (normalizeTitle(p.title) === normalizedIncomingTitle) return true;
    if (incomingSources.length === 0 || !p.sources) return false;
    const existingSources = p.sources.split("\n");
    return incomingSources.some((s) => existingSources.includes(s));
  });

  if (duplicate) {
    return NextResponse.json(
      {
        error: "provável duplicata: já existe uma matéria com título ou fonte iguais nos últimos 60 dias.",
        conflictingPost: {
          id: duplicate.id,
          slug: duplicate.slug,
          title: duplicate.title,
          status: duplicate.status,
          createdAt: duplicate.createdAt,
        },
      },
      { status: 409 }
    );
  }

  const slug = slugify(title);

  const post = await prisma.blogPost.create({
    data: {
      officeId: office.id,
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
