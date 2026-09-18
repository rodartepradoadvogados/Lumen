import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

const HERMES_BIN = process.env.HERMES_BIN || "/root/.local/bin/lumen-master";
const TENANT_PROFILE_PREFIX = "lumen-tenant-";

function getTenantProfileName(officeSlug: string): string {
  return `${TENANT_PROFILE_PREFIX}${officeSlug}`;
}

async function runHermesSessions(profileName: string, action: "list" | "delete", sessionId?: string): Promise<string> {
  const args = ["sessions", action];
  if (sessionId) args.push(sessionId);
  args.push("--profile", profileName, "--quiet");

  const command = `${HERMES_BIN} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`;

  const { execSync } = await import("child_process");
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5
    });
    return output.trim();
  } catch (error) {
    console.error("[hermes/sessions] Error:", mensagemDeErro(error));
    throw new Error(`Hermes sessions failed: ${mensagemDeErro(error)}`);
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const office = await prisma.office.findUnique({
    where: { id: user.officeId },
    select: { id: true, slug: true, name: true, status: true }
  });

  if (!office || office.status !== "ATIVA") {
    return NextResponse.json({ error: "Escritório inativo ou não encontrado." }, { status: 403 });
  }

  const profileName = getTenantProfileName(office.slug);

  try {
    const output = await runHermesSessions(profileName, "list");
    const sessions = output.split("\n").filter(Boolean).map(line => {
      const [id, ...rest] = line.split(/\s+/);
      return { id, title: rest.join(" ") || "Sem título" };
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[hermes/sessions] Error:", error);
    return NextResponse.json(
      { error: "Não foi possível listar as sessões." },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const office = await prisma.office.findUnique({
    where: { id: user.officeId },
    select: { id: true, slug: true, status: true }
  });

  if (!office || office.status !== "ATIVA") {
    return NextResponse.json({ error: "Escritório inativo ou não encontrado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId obrigatório." }, { status: 400 });
  }

  const profileName = getTenantProfileName(office.slug);

  try {
    await runHermesSessions(profileName, "delete", sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[hermes/sessions] Delete error:", error);
    return NextResponse.json(
      { error: "Não foi possível excluir a sessão." },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";