import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAuthUrl } from "@/lib/googleDrive";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }
  return NextResponse.redirect(getAuthUrl());
}
