import { NextRequest, NextResponse } from "next/server";
import { syncJusbrasilEmails } from "@/lib/jusbrasilEmailSync";
import { syncOutlookEmails } from "@/lib/outlookEmailSync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [gmail, outlook] = await Promise.all([syncJusbrasilEmails(), syncOutlookEmails()]);
  // Sem isto o cron engolia a falha por caixa: o erro só existia no retorno do botão
  // "Sincronizar agora". Agora aparece nos logs da Vercel e, gravado por caixa
  // (GoogleCredential.lastSyncError), também em Conexões e em Meu Perfil.
  const falhas = [...gmail.errors, ...outlook.errors];
  if (falhas.length > 0) {
    console.error("[jusbrasil-sync] falhas na varredura:", falhas);
  }
  return NextResponse.json({ gmail, outlook });
}
