import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDropboxAuthUrl } from "@/lib/dropbox";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { buildOAuthState } from "@/lib/oauthState";

// Diferente do Microsoft (que tem 2 modos, e-mail vs armazenamento, distinguidos por
// ?mode=/state), Dropbox nesta entrega só serve para armazenamento — sempre a conexão do
// escritório, sempre exigindo admin ou suporte mascarado (mesmo padrão da conexão principal do
// Google Drive/OneDrive).
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!canConfigureIntegrations(user)) {
    return NextResponse.redirect(new URL("/configuracoes", request.url));
  }
  return NextResponse.redirect(getDropboxAuthUrl(buildOAuthState("dropbox")));
}
