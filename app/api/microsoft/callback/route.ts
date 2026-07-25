import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveMicrosoftTokensFromCode } from "@/lib/microsoftGraph";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/configuracoes?microsoft=erro", request.url));
  }
  if (!user?.active) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }

  try {
    await saveMicrosoftTokensFromCode(code, user.id, user.officeId);
    return NextResponse.redirect(new URL("/configuracoes?microsoft=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.redirect(new URL(`/configuracoes?microsoft=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
