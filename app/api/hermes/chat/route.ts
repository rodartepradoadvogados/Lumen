import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

const HERMES_BIN = process.env.HERMES_BIN || "/root/.local/bin/lumen-master";
const TENANT_PROFILE_PREFIX = "lumen-tenant-";

function getTenantProfileName(officeSlug: string): string {
  return `${TENANT_PROFILE_PREFIX}${officeSlug}`;
}

async function runHermesChat(
  profileName: string,
  message: string,
  sessionId?: string
): Promise<{ response: string; sessionId: string }> {
  const args = [
    "chat",
    "-q", message,
    "--profile", profileName,
    "--quiet"
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  const command = `${HERMES_BIN} ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`;

  const { execSync } = await import("child_process");
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10
    });

    const lines = output.trim().split("\n");
    const sessionIdLine = lines.find(l => l.startsWith("session_id:"));
    const newSessionId = sessionIdLine ? sessionIdLine.replace("session_id:", "").trim() : sessionId || "";
    const response = lines.filter(l => !l.startsWith("session_id:")).join("\n").trim();

    return { response, sessionId: newSessionId };
  } catch (error: any) {
    console.error("[hermes/chat] Error:", error.message);
    throw new Error(`Hermes execution failed: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
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

  let body: { message: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const message = (body?.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Envie uma mensagem." }, { status: 400 });
  }

  const profileName = getTenantProfileName(office.slug);

  try {
    const { response, sessionId } = await runHermesChat(profileName, message, body.sessionId);

    return NextResponse.json({
      response,
      sessionId,
      tenant: { id: office.id, slug: office.slug, name: office.name }
    });
  } catch (error: any) {
    console.error("[hermes/chat] Error:", error);

    if (error.message.includes("profile") && error.message.includes("not found")) {
      return NextResponse.json(
        { error: "Perfil do Hermes não provisionado para este escritório. Contate o administrador." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "O assistente não conseguiu responder agora. Tente novamente em instantes." },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";