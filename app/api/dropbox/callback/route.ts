import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveDropboxTokensFromCode } from "@/lib/dropboxStorage";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/configuracoes?dropbox=erro", request.url));
  if (!canConfigureIntegrations(user)) return NextResponse.redirect(new URL("/configuracoes", request.url));

  try {
    await saveDropboxTokensFromCode(code, user.officeId);
    return NextResponse.redirect(new URL("/configuracoes?dropbox=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.redirect(new URL(`/configuracoes?dropbox=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
