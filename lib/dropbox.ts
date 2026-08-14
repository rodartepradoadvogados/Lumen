// Integração com o Dropbox — "env-gated" como Microsoft/BTG/WhatsApp: dormente e inofensivo
// enquanto DROPBOX_CLIENT_ID/DROPBOX_CLIENT_SECRET não estiverem cadastrados (ver
// README_MICROSOFT.md, seção 2 — registro do app no Dropbox App Console). Ao contrário de
// lib/microsoftGraph.ts, aqui NÃO há pipeline de e-mail nenhum — Dropbox neste projeto serve só
// para armazenamento de anexos (ver lib/dropboxStorage.ts), então este módulo cobre só
// autenticação (OAuth) + descoberta da conta (e-mail), mirror da PARTE de auth de
// lib/microsoftGraph.ts (exchangeMicrosoftCodeForTokens/getMicrosoftAccessToken/
// getMicrosoftAuthUrl).
const AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";

export function isDropboxConfigured(): boolean {
  return Boolean(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET);
}

function redirectUri(): string {
  return process.env.DROPBOX_REDIRECT_URI || "https://lumen-flax-chi.vercel.app/api/dropbox/callback";
}

// Sem `mode` — diferente de getMicrosoftAuthUrl, Dropbox nesta entrega só serve para
// armazenamento (nunca e-mail), então a URL de autorização não precisa distinguir "modo" de
// verdade. `state` ainda é obrigatório do lado de quem chama (ver lib/oauthState.ts): mesmo
// com um único fluxo possível, o callback continua sendo um GET com efeito colateral
// persistente, e sem nonce anti-CSRF é sequestrável do mesmo jeito que Google/Microsoft (achado
// A61 da revisão gauntlet). token_access_type=offline é o equivalente Dropbox do
// offline_access (Microsoft)/access_type=offline (Google): necessário para ganhar um
// refresh_token.
export function getDropboxAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DROPBOX_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    token_access_type: "offline",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeDropboxCodeForTokens(code: string): Promise<{ accountEmail: string; refreshToken: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: process.env.DROPBOX_CLIENT_ID!,
      client_secret: process.env.DROPBOX_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Dropbox recusou o código de autorização (${res.status}): ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.refresh_token) {
    throw new Error("O Dropbox não retornou um refresh_token. Tente conectar novamente.");
  }

  // Dropbox aceita POST sem corpo em vários endpoints RPC, mas alguns clientes HTTP reclamam de
  // corpo vazio — envia body "null" (JSON válido) com Content-Type: application/json, como a
  // própria documentação da Dropbox recomenda para chamadas RPC sem parâmetro.
  const me = await fetch(ACCOUNT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
    body: "null",
  });
  if (!me.ok) throw new Error(`Não foi possível obter o e-mail da conta Dropbox (${me.status}): ${await me.text()}`);
  const meData = (await me.json()) as { email?: string };
  if (!meData.email) throw new Error("A conta Dropbox não tem um e-mail associado.");

  return { accountEmail: meData.email, refreshToken: tokens.refresh_token };
}

// Compartilhado com lib/dropboxStorage.ts — renova o access token via refresh_token. Diferente do
// Google/Microsoft, a resposta do Dropbox não traz um novo refresh_token no refresh (é normal,
// mantenha o refresh_token salvo como está).
export async function getDropboxAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.DROPBOX_CLIENT_ID!,
      client_secret: process.env.DROPBOX_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar o token do Dropbox (${res.status}): ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;
  return tokens.access_token;
}
