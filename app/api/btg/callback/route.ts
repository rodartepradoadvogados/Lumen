import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { exchangeBtgCode } from "@/lib/btg";
import { verifyAndConsumeOAuthState } from "@/lib/oauthState";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isPlatformOwner) {
    return NextResponse.redirect(new URL("/painel", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");
  if (errorParam || !code) {
    return NextResponse.redirect(new URL(`/painel-mestre?btg=erro&msg=${encodeURIComponent(errorParam || "código ausente")}`, request.url));
  }

  // SEGURANÇA (achado V3, auditoria de 05/09/2026): nonce anti-CSRF (mesmo padrão de
  // Google/Microsoft/Dropbox, achado A61) — sem isso, este GET com efeito colateral (sobrescreve
  // a conexão BTG da plataforma inteira) aceitava um `code` de qualquer origem, desde que um
  // platform owner logado clicasse no link.
  const verified = verifyAndConsumeOAuthState(request.nextUrl.searchParams.get("state"));
  if (!verified) {
    return NextResponse.redirect(new URL("/painel-mestre?btg=erro&msg=state_invalido", request.url));
  }

  const result = await exchangeBtgCode(code);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/painel-mestre?btg=erro&msg=${encodeURIComponent(result.error || "")}`, request.url));
  }
  return NextResponse.redirect(new URL("/painel-mestre?btg=conectado", request.url));
}
