import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

const PROVISION_SCRIPT = "/root/.hermes/profiles/lumen-master/scripts/provision_tenant.py";
const HERMES_BIN = process.env.HERMES_BIN || "/root/.local/bin/lumen-master";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  let body: { slug: string; officeId: string; name: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { slug, officeId, name } = body;
  if (!slug || !officeId || !name) {
    return NextResponse.json({ error: "slug, officeId e name são obrigatórios." }, { status: 400 });
  }

  const office = await prisma.office.findUnique({ where: { id: officeId } });
  if (!office) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }
  if (office.slug !== slug) {
    return NextResponse.json({ error: "Slug não confere com o escritório." }, { status: 400 });
  }

  const { execSync } = await import("child_process");
  try {
    const command = `python3 ${PROVISION_SCRIPT} provision --slug ${slug} --id ${officeId} --name "${name.replace(/"/g, '\\"')}"`;
    const output = execSync(command, { encoding: "utf-8", timeout: 120000 });
    const result = JSON.parse(output.trim().split("\n").pop() || "{}");

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Falha no provisionamento" }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: result });
  } catch (error: any) {
    console.error("[hermes/provision] Error:", error);
    let detail = error.message;
    try {
      const stderr = error.stderr?.toString() || "";
      const lastLine = stderr.trim().split("\n").pop();
      if (lastLine) detail = lastLine;
    } catch {}
    return NextResponse.json({ error: `Falha no provisionamento: ${detail}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  const { execSync } = await import("child_process");
  try {
    const command = `python3 ${PROVISION_SCRIPT} list`;
    const output = execSync(command, { encoding: "utf-8", timeout: 30000 });
    const result = JSON.parse(output.trim().split("\n").pop() || "{}");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[hermes/provision] List error:", error);
    return NextResponse.json({ error: "Falha ao listar perfis" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug obrigatório." }, { status: 400 });
  }

  const { execSync } = await import("child_process");
  try {
    const command = `python3 ${PROVISION_SCRIPT} deprovision --slug ${slug}`;
    const output = execSync(command, { encoding: "utf-8", timeout: 60000 });
    const result = JSON.parse(output.trim().split("\n").pop() || "{}");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[hermes/provision] Deprovision error:", error);
    return NextResponse.json({ error: "Falha ao remover perfil" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";