import { cookies } from "next/headers";
import crypto from "crypto";

// Nonce anti-CSRF para os três fluxos OAuth de armazenamento/e-mail (Google, Microsoft,
// Dropbox) — achado A61 da revisão gauntlet.
//
// Antes disso, o `state` de cada provedor era reaproveitado só como DISCRIMINADOR DE MODO
// ("drive" vs "jusbrasil", "onedrive" vs e-mail Outlook) — nunca um nonce ligado à sessão que
// iniciou o fluxo. Um /callback é um GET com efeito colateral persistente (grava
// refreshToken na credencial do escritório), então sem nonce ele é um alvo clássico de
// "OAuth authorization code injection": um atacante inicia o consentimento com a PRÓPRIA conta,
// captura o `code` antes do redirect final, e manda pra vítima logada um link
// `/api/google/callback?code=<code_do_atacante>` — o servidor troca o code e grava a conta do
// atacante como a credencial de armazenamento do escritório da vítima, sem nenhum aviso além de
// "conectado". Dropbox nem tinha `state` nenhum.
//
// Mecanismo: buildOAuthState grava um nonce aleatório num cookie httpOnly de vida curta e o
// embute no `state` enviado ao provedor como "<modo>:<nonce>". verifyAndConsumeOAuthState separa
// as duas partes no retorno e só aceita se o nonce bater com o cookie — que é apagado de
// qualquer forma, pra valer uma vez só (reuso do state em duas tentativas de callback também é
// recusado).
const OAUTH_STATE_COOKIE = "lumen-oauth-state";

export function buildOAuthState(mode: string): string {
  const nonce = crypto.randomBytes(24).toString("hex");
  cookies().set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Consentimento OAuth é interativo e rápido — não devia levar mais que alguns minutos entre
    // o /connect e o /callback.
    maxAge: 10 * 60,
  });
  return `${mode}:${nonce}`;
}

// Devolve o modo só quando o nonce bate com o cookie gravado por buildOAuthState; `null` em
// qualquer caso de dúvida (sem state, sem cookie, nonce não bate, ou formato inesperado) — o
// chamador deve tratar `null` como "recusar o callback", nunca cair num modo default.
export function verifyAndConsumeOAuthState(state: string | null): { mode: string } | null {
  const store = cookies();
  const expected = store.get(OAUTH_STATE_COOKIE)?.value;
  store.delete(OAUTH_STATE_COOKIE);

  if (!state || !expected) return null;
  const sep = state.indexOf(":");
  if (sep === -1) return null;
  const mode = state.slice(0, sep);
  const nonce = state.slice(sep + 1);
  if (nonce !== expected) return null;
  return { mode };
}
