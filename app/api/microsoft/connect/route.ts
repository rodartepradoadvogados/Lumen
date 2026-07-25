import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getMicrosoftAuthUrl } from "@/lib/microsoftGraph";

// Qualquer pessoa ativa conecta a própria caixa Outlook — mesmo modelo do
// /api/google/connect?mode=jusbrasil (por pessoa, não por escritório).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.active) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }
  return NextResponse.redirect(getMicrosoftAuthUrl());
}
