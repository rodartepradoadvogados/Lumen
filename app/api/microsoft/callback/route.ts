import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveMicrosoftTokensFromCode } from "@/lib/microsoftGraph";
import { saveOneDriveTokensFromCode } from "@/lib/oneDriveStorage";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { verifyAndConsumeOAuthState } from "@/lib/oauthState";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/conexoes?microsoft=erro", request.url));
  }

  // Nonce anti-CSRF (achado A61) — ver lib/oauthState.ts.
  const verified = verifyAndConsumeOAuthState(request.nextUrl.searchParams.get("state"));
  if (!verified) {
    return NextResponse.redirect(new URL("/conexoes?microsoft=erro&msg=state", request.url));
  }

  try {
    if (verified.mode === "onedrive") {
      // Conexão de armazenamento (OneDrive) é do ESCRITÓRIO — admin ou suporte mascarado, mesmo
      // padrão da conexão principal do Google Drive.
      if (!canConfigureIntegrations(user)) return NextResponse.redirect(new URL("/conexoes", request.url));
      await saveOneDriveTokensFromCode(code, user.officeId);
      return NextResponse.redirect(new URL("/conexoes?microsoft=onedrive-conectado", request.url));
    }

    // Conexão pessoal (Outlook por pessoa) — volta pra /perfil, não /conexoes (documento 04:
    // "Conexões" é só integração do escritório).
    if (!user?.active) {
      return NextResponse.redirect(new URL("/perfil", request.url));
    }
    await saveMicrosoftTokensFromCode(code, user.id, user.officeId);
    return NextResponse.redirect(new URL("/perfil?microsoft=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    const destino = verified.mode === "onedrive" ? "/conexoes" : "/perfil";
    return NextResponse.redirect(new URL(`${destino}?microsoft=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
