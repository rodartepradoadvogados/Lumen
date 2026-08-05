import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveMicrosoftTokensFromCode } from "@/lib/microsoftGraph";
import { saveOneDriveTokensFromCode } from "@/lib/oneDriveStorage";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/configuracoes?microsoft=erro", request.url));
  }

  try {
    if (state === "onedrive") {
      // Conexão de armazenamento (OneDrive) é do ESCRITÓRIO — admin ou suporte mascarado, mesmo
      // padrão da conexão principal do Google Drive.
      if (!canConfigureIntegrations(user)) return NextResponse.redirect(new URL("/configuracoes", request.url));
      await saveOneDriveTokensFromCode(code, user.officeId);
      return NextResponse.redirect(new URL("/configuracoes?microsoft=onedrive-conectado", request.url));
    }

    if (!user?.active) {
      return NextResponse.redirect(new URL("/configuracoes", request.url));
    }
    await saveMicrosoftTokensFromCode(code, user.id, user.officeId);
    return NextResponse.redirect(new URL("/configuracoes?microsoft=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.redirect(new URL(`/configuracoes?microsoft=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
