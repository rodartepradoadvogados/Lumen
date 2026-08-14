import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveTokensFromCode, saveJusbrasilTokensFromCode } from "@/lib/googleDrive";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { verifyAndConsumeOAuthState } from "@/lib/oauthState";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/configuracoes?google=erro", request.url));
  }

  // Nonce anti-CSRF (achado A61) — sem isso, este GET com efeito colateral (grava credencial)
  // aceitava um `code` de qualquer origem. Ver lib/oauthState.ts.
  const verified = verifyAndConsumeOAuthState(request.nextUrl.searchParams.get("state"));
  if (!verified) {
    return NextResponse.redirect(new URL("/configuracoes?google=erro&msg=state", request.url));
  }

  try {
    if (verified.mode === "jusbrasil") {
      if (!user?.active) return NextResponse.redirect(new URL("/configuracoes", request.url));
      await saveJusbrasilTokensFromCode(code, user.id, user.officeId);
    } else {
      // Conexão principal (Drive/Docs) — mesmo gate de /api/google/connect: admin ou suporte
      // mascarado configurando integração.
      if (!canConfigureIntegrations(user)) return NextResponse.redirect(new URL("/configuracoes", request.url));
      await saveTokensFromCode(code, user.officeId);
    }
    return NextResponse.redirect(new URL("/configuracoes?google=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.redirect(new URL(`/configuracoes?google=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
