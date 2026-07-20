import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAuthUrl } from "@/lib/googleDrive";

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

  // Conexão principal (Drive/Docs) — só sócios administram.
  if (!user?.isAdmin) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }
  return NextResponse.redirect(getAuthUrl("drive"));
}
