import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getBtgAuthorizeUrl, isBtgConfigured } from "@/lib/btg";
import { buildOAuthState } from "@/lib/oauthState";

// Inicia o fluxo OAuth (Authorization Code) com o BTG Empresas — só platform owners.
//
// SEGURANÇA (achado V3, auditoria de 05/09/2026): state passa a ser o nonce anti-CSRF de
// lib/oauthState.ts (mesmo padrão de Google/Microsoft/Dropbox, achado A61), não mais user.id —
// um id de usuário não é segredo nenhum, então não protegia contra injeção de código OAuth
// (alguém iniciar o consentimento com a PRÓPRIA conta BTG e mandar o code pronto para um
// platform owner logado clicar).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isPlatformOwner) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }
  if (!isBtgConfigured()) {
    return NextResponse.redirect(new URL("/painel-mestre?btg=nao_configurado", request.url));
  }
  return NextResponse.redirect(getBtgAuthorizeUrl(buildOAuthState("btg")));
}
