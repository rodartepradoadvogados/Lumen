import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getMicrosoftAuthUrl } from "@/lib/microsoftGraph";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { buildOAuthState } from "@/lib/oauthState";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const mode = request.nextUrl.searchParams.get("mode");

  if (mode === "onedrive") {
    // Conexão de armazenamento (OneDrive) é do ESCRITÓRIO, não da pessoa — mesmo padrão de
    // /api/google/connect (conexão principal do Drive): admin ou suporte mascarado inicia.
    if (!canConfigureIntegrations(user)) {
      return NextResponse.redirect(new URL("/conexoes", request.url));
    }
    return NextResponse.redirect(getMicrosoftAuthUrl(buildOAuthState("onedrive")));
  }

  // Qualquer pessoa ativa conecta a própria caixa Outlook — mesmo modelo do
  // /api/google/connect?mode=jusbrasil (por pessoa, não por escritório) — conexão pessoal, volta
  // pra /perfil (documento 04: "Conexões" é só integração do escritório).
  if (!user?.active) {
    return NextResponse.redirect(new URL("/perfil", request.url));
  }
  return NextResponse.redirect(getMicrosoftAuthUrl(buildOAuthState("outlook")));
}
