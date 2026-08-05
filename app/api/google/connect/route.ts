import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAuthUrl } from "@/lib/googleDrive";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const mode = request.nextUrl.searchParams.get("mode");

  if (mode === "jusbrasil") {
    // Qualquer usuário ativo pode conectar seu próprio e-mail para o Jusbrasil.
    if (!user?.active) {
      return NextResponse.redirect(new URL("/configuracoes", request.url));
    }
    return NextResponse.redirect(getAuthUrl("jusbrasil"));
  }

  // Conexão principal (Drive/Docs) — sócios administram, e também o suporte em sessão
  // mascarada (motivo CONFIG_INTEGRACAO — ver lib/supportCapabilities.ts).
  if (!canConfigureIntegrations(user)) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }
  return NextResponse.redirect(getAuthUrl("drive"));
}
