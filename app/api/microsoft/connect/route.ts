import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getMicrosoftAuthUrl } from "@/lib/microsoftGraph";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const mode = request.nextUrl.searchParams.get("mode");

  if (mode === "onedrive") {
    // Conexão de armazenamento (OneDrive) é do ESCRITÓRIO, não da pessoa — mesmo padrão de
    // /api/google/connect (conexão principal do Drive): só admin inicia.
    if (!user?.isAdmin) {
      return NextResponse.redirect(new URL("/configuracoes", request.url));
    }
    return NextResponse.redirect(getMicrosoftAuthUrl("onedrive"));
  }

  // Qualquer pessoa ativa conecta a própria caixa Outlook — mesmo modelo do
  // /api/google/connect?mode=jusbrasil (por pessoa, não por escritório).
  if (!user?.active) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }
  return NextResponse.redirect(getMicrosoftAuthUrl());
}
