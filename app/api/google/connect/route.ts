import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAuthUrl } from "@/lib/googleDrive";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { buildOAuthState } from "@/lib/oauthState";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const mode = request.nextUrl.searchParams.get("mode");

  if (mode === "jusbrasil") {
    // Qualquer usuário ativo pode conectar seu próprio e-mail para o Jusbrasil — conexão
    // pessoal, então volta para /perfil (documento 04 do handoff do redesenho Modernist:
    // "Conexões" é só para integração do escritório, não para conta pessoal — ver comentário em
    // app/(app)/perfil/page.tsx).
    if (!user?.active) {
      return NextResponse.redirect(new URL("/perfil", request.url));
    }
    return NextResponse.redirect(getAuthUrl(buildOAuthState("jusbrasil")));
  }

  // Conexão principal (Drive/Docs) — sócios administram, e também o suporte em sessão
  // mascarada (motivo CONFIG_INTEGRACAO — ver lib/supportCapabilities.ts).
  if (!canConfigureIntegrations(user)) {
    return NextResponse.redirect(new URL("/conexoes", request.url));
  }
  return NextResponse.redirect(getAuthUrl(buildOAuthState("drive")));
}
