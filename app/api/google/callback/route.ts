import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveTokensFromCode } from "@/lib/googleDrive";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/configuracoes?google=erro", request.url));
  }

  try {
    await saveTokensFromCode(code);
    return NextResponse.redirect(new URL("/configuracoes?google=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.redirect(new URL(`/configuracoes?google=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
