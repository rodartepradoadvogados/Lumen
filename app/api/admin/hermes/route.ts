import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

const HERMES_BIN = process.env.HERMES_BIN || "/root/.local/bin/lumen-master";
const TENANT_PROFILE_PREFIX = "lumen-tenant-";

function getTenantProfileName(officeSlug: string): string {
  return `${TENANT_PROFILE_PREFIX}${officeSlug}`;
}

async function runHermesCommand(profileName: string, args: string[]): Promise<string> {
  const fullArgs = [profileName, ...args];
  const command = `${HERMES_BIN} ${fullArgs.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`;

  const { execSync } = await import("child_process");
  try {
    return execSync(command, { encoding: "utf-8", timeout: 60000, maxBuffer: 1024 * 1024 * 5 }).trim();
  } catch (error) {
    console.error("[hermes/admin] Error:", mensagemDeErro(error));
    throw new Error(`Hermes command failed: ${mensagemDeErro(error)}`);
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const slug = searchParams.get("slug");

  try {
    if (action === "list") {
      const offices = await prisma.office.findMany({
        where: { isInternal: false },
        select: { id: true, slug: true, name: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      });

      const profiles = [];
      for (const office of offices) {
        const profileName = getTenantProfileName(office.slug);
        let status = "not_provisioned";
        let sessionCount = 0;
        let memorySize = 0;

        try {
          const sessionsOut = await runHermesCommand(profileName, ["sessions", "list", "--quiet"]);
          sessionCount = sessionsOut.split("\n").filter(Boolean).length;
          status = "ready";
        } catch {
          status = "not_provisioned";
        }

        try {
          const statePath = `/root/.hermes/profiles/${profileName}/state.db`;
          const fs = await import("fs");
          if (fs.existsSync(statePath)) {
            const stats = fs.statSync(statePath);
            memorySize = stats.size;
          }
        } catch {}

        profiles.push({
          office: { id: office.id, slug: office.slug, name: office.name, status: office.status },
          profile: profileName,
          status,
          sessionCount,
          memorySizeKB: Math.round(memorySize / 1024)
        });
      }

      return NextResponse.json({ profiles });
    }

    if (action === "status" && slug) {
      const office = await prisma.office.findUnique({ where: { slug } });
      if (!office) return NextResponse.json({ error: "Escritório não encontrado" }, { status: 404 });

      const profileName = getTenantProfileName(slug);
      let health = "unknown";
      let sessions: unknown[] = [];

      try {
        await runHermesCommand(profileName, ["chat", "-q", "ping", "--quiet"]);
        health = "healthy";
      } catch {
        health = "unhealthy";
      }

      try {
        const sessionsOut = await runHermesCommand(profileName, ["sessions", "list", "--quiet"]);
        sessions = sessionsOut.split("\n").filter(Boolean).map(line => {
          const [id, ...rest] = line.split(/\s+/);
          return { id, title: rest.join(" ") || "Sem título" };
        });
      } catch {}

      return NextResponse.json({ health, sessions, profile: profileName });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("[hermes/admin] Error:", error);
    return NextResponse.json({ error: mensagemDeErro(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  let body: { action: string; slug?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const { action, slug, sessionId } = body;
  if (!slug) return NextResponse.json({ error: "slug obrigatório" }, { status: 400 });

  const office = await prisma.office.findUnique({ where: { slug } });
  if (!office) return NextResponse.json({ error: "Escritório não encontrado" }, { status: 404 });

  const profileName = getTenantProfileName(slug);

  try {
    if (action === "restart") {
      await runHermesCommand(profileName, ["chat", "-q", "ping", "--quiet"]);
      return NextResponse.json({ success: true, message: "Health check OK" });
    }

    if (action === "clear_memory") {
      const statePath = `/root/.hermes/profiles/${profileName}/state.db`;
      const fs = await import("fs");
      if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
      return NextResponse.json({ success: true, message: "Memória limpa" });
    }

    if (action === "delete_session" && sessionId) {
      await runHermesCommand(profileName, ["sessions", "delete", sessionId, "--quiet"]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("[hermes/admin] Action error:", error);
    return NextResponse.json({ error: mensagemDeErro(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";