import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { exchangeBtgCode } from "@/lib/btg";

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

  const result = await exchangeBtgCode(code);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/painel-mestre?btg=erro&msg=${encodeURIComponent(result.error || "")}`, request.url));
  }
  return NextResponse.redirect(new URL("/painel-mestre?btg=conectado", request.url));
}
