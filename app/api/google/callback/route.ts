import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveTokensFromCode, saveJusbrasilTokensFromCode } from "@/lib/googleDrive";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/configuracoes?google=erro", request.url));
  }

  try {
    if (state === "jusbrasil") {
      if (!user?.active) return NextResponse.redirect(new URL("/configuracoes", request.url));
      await saveJusbrasilTokensFromCode(code, user.id);
    } else {
      if (!user?.isAdmin) return NextResponse.redirect(new URL("/configuracoes", request.url));
      await saveTokensFromCode(code);
    }
    return NextResponse.redirect(new URL("/configuracoes?google=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.redirect(new URL(`/configuracoes?google=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
