import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getBtgAuthorizeUrl, isBtgConfigured } from "@/lib/btg";

// Inicia o fluxo OAuth (Authorization Code) com o BTG Empresas — só platform owners.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isPlatformOwner) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }
  if (!isBtgConfigured()) {
    return NextResponse.redirect(new URL("/painel-mestre?btg=nao_configurado", request.url));
  }
  return NextResponse.redirect(getBtgAuthorizeUrl(user.id));
}
