import { NextRequest, NextResponse } from "next/server";
import { syncAllOfficesDrive } from "@/lib/driveSync";

export const maxDuration = 300;

// Roda diariamente (ver vercel.json) — sync reverso Drive -> banco (ver lib/driveSync.ts):
// registra como Attachment qualquer arquivo salvo direto no Drive (fora do app) que já esteja
// na estrutura de pastas certa, e sinaliza em DriveSyncIssue (Central de Alertas, isAdmin only)
// tudo que fugir dessa estrutura sem dar pra adivinhar a correção sozinho.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncAllOfficesDrive();
  return NextResponse.json(result, { status: 200 });
}
