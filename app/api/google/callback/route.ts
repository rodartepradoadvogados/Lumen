import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { saveTokensFromCode, saveJusbrasilTokensFromCode } from "@/lib/googleDrive";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { verifyAndConsumeOAuthState } from "@/lib/oauthState";
import { contarEmailsPublicacoes, limiteEmailsPublicacoes } from "@/lib/officeLimits";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const code = request.nextUrl.searchParams.get("code");
  // Sem `state` ainda pra saber se é conexão pessoal (jusbrasil, volta pra /perfil) ou do
  // escritório (drive, volta pra /conexoes) — sem `code` nem chega a verificar o state, então usa
  // /conexoes como padrão neutro (é o destino da maioria dos casos: conexão do escritório).
  if (!code) {
    return NextResponse.redirect(new URL("/conexoes?google=erro", request.url));
  }

  // Nonce anti-CSRF (achado A61) — sem isso, este GET com efeito colateral (grava credencial)
  // aceitava um `code` de qualquer origem. Ver lib/oauthState.ts.
  const verified = verifyAndConsumeOAuthState(request.nextUrl.searchParams.get("state"));
  if (!verified) {
    return NextResponse.redirect(new URL("/conexoes?google=erro&msg=state", request.url));
  }

  try {
    if (verified.mode === "jusbrasil") {
      // Conexão pessoal — documento 04: "Conexões" é só integração do escritório, conta pessoal
      // vive em /perfil (ver comentário em app/(app)/perfil/page.tsx).
      if (!user?.active) return NextResponse.redirect(new URL("/perfil", request.url));
      await saveJusbrasilTokensFromCode(code, user.id, user.officeId);
      return NextResponse.redirect(new URL("/perfil?google=conectado", request.url));
    }
    if (verified.mode === "jusbrasil-shared") {
      // Caixa compartilhada (sem dono individual) — mesmo gate de admin/suporte mascarado das
      // outras conexões do escritório, mais o teto de e-mails do plano (ver lib/officeLimits.ts:
      // limiteEmailsPublicacoes, mesmo número de "OABs" do catálogo de vendas).
      if (!canConfigureIntegrations(user)) return NextResponse.redirect(new URL("/conexoes", request.url));
      const [limite, usados] = await Promise.all([limiteEmailsPublicacoes(user.officeId), contarEmailsPublicacoes(user.officeId)]);
      if (limite != null && usados >= limite) {
        const msg = `Limite de ${limite} e-mail(s) de captura de publicações do plano atingido.`;
        return NextResponse.redirect(new URL(`/conexoes?google=erro&msg=${encodeURIComponent(msg)}`, request.url));
      }
      await saveJusbrasilTokensFromCode(code, null, user.officeId);
      return NextResponse.redirect(new URL("/conexoes?google=conectado", request.url));
    }
    // Conexão principal (Drive/Docs) — mesmo gate de /api/google/connect: admin ou suporte
    // mascarado configurando integração.
    if (!canConfigureIntegrations(user)) return NextResponse.redirect(new URL("/conexoes", request.url));
    await saveTokensFromCode(code, user.officeId);
    return NextResponse.redirect(new URL("/conexoes?google=conectado", request.url));
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    const destino = verified.mode === "jusbrasil" ? "/perfil" : "/conexoes";
    return NextResponse.redirect(new URL(`${destino}?google=erro&msg=${encodeURIComponent(message)}`, request.url));
  }
}
