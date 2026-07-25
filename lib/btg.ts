// Emissão de boletos via BTG Empresas — conta do próprio Rodarte Prado no BTG, usada pra
// cobrar os escritórios-clientes da plataforma (Painel Mestre). Segue o mesmo padrão
// "env-gated" de lib/whatsapp.ts e lib/push.ts: dormente e inofensivo sem credenciais, nunca
// lança pra quem chama (sempre retorna { ok, error? } ou similar).
//
// A API do BTG Empresas exige o fluxo OAuth2 "Authorization Code" pra emitir boleto — não dá
// pra usar client_credentials simples (o BTG recusa token de client_credentials nessa rota
// com "invalid token"). Isso significa: alguém com acesso à conta BTG Empresas do escritório
// precisa logar uma vez em https://id.btgpactual.com e autorizar o app (fluxo iniciado em
// /api/btg/connect) antes de qualquer boleto poder ser emitido. Ver README_BTG.md para o
// passo a passo completo do que falta ser feito no portal do BTG antes disso funcionar de
// ponta a ponta.
//
// IMPORTANTE — payload de criação do boleto: a documentação de referência completa
// (developers.empresas.btgpactual.com/reference/post_bank-slips) fica atrás de login no
// portal do BTG e não foi possível ler o schema exato de fora. O corpo abaixo segue os campos
// padrão de emissão de boleto (pagador, valor, vencimento, instruções) — precisa ser
// confirmado/ajustado contra o Sandbox assim que o app estiver registrado (ver
// README_BTG.md), comparando com o erro real que a API devolver na primeira tentativa.

import { prisma } from "@/lib/prisma";

const ENV = process.env.BTG_ENV === "production" ? "production" : "sandbox";

const AUTH_BASE = ENV === "production" ? "https://id.btgpactual.com" : "https://id.sandbox.btgpactual.com";
const API_BASE = ENV === "production" ? "https://api.empresas.btgpactual.com" : "https://api.sandbox.empresas.btgpactual.com";

export function isBtgConfigured(): boolean {
  return Boolean(process.env.BTG_CLIENT_ID && process.env.BTG_CLIENT_SECRET);
}

function redirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lumen-flax-chi.vercel.app";
  return `${appUrl.replace(/\/$/, "")}/api/btg/callback`;
}

// Passo 1 do fluxo: URL pra onde mandar o platform owner logar no BTG e autorizar o app.
export function getBtgAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.BTG_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    scope: "openid boletos", // "boletos" é um palpite — ajustar conforme o BTG documentar no app registrado
    state,
  });
  return `${AUTH_BASE}/auth?${params.toString()}`;
}

// Passo 2: troca o "code" do callback por access_token + refresh_token, e já persiste.
export async function exchangeBtgCode(code: string): Promise<{ ok: boolean; error?: string }> {
  if (!isBtgConfigured()) return { ok: false, error: "BTG_CLIENT_ID/BTG_CLIENT_SECRET não configurados." };
  try {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: process.env.BTG_CLIENT_ID!,
        client_secret: process.env.BTG_CLIENT_SECRET!,
      }),
    });
    if (!res.ok) return { ok: false, error: `BTG recusou a troca do código (HTTP ${res.status}): ${await res.text().catch(() => "")}` };
    const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };

    await prisma.btgConnection.deleteMany({}); // conexão única — remove qualquer anterior antes de salvar a nova
    await prisma.btgConnection.create({
      data: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: new Date(Date.now() + json.expires_in * 1000),
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido ao conectar com o BTG" };
  }
}

async function refreshBtgToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  try {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.BTG_CLIENT_ID!,
        client_secret: process.env.BTG_CLIENT_SECRET!,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + json.expires_in * 1000) };
  } catch {
    return null;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const conn = await prisma.btgConnection.findFirst();
  if (!conn) return null;
  if (conn.expiresAt.getTime() - Date.now() > 60_000) return conn.accessToken;

  const refreshed = await refreshBtgToken(conn.refreshToken);
  if (!refreshed) return null;
  await prisma.btgConnection.update({
    where: { id: conn.id },
    data: { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt },
  });
  return refreshed.accessToken;
}

export async function isBtgConnected(): Promise<boolean> {
  return Boolean(await getValidAccessToken());
}

export type CreateBoletoInput = {
  payerName: string;
  payerDocument: string; // CPF ou CNPJ do escritório-cliente, só dígitos
  amount: number;
  dueDate: Date;
  description: string;
};

export async function createBoleto(input: CreateBoletoInput): Promise<{ ok: boolean; boletoId?: string; boletoUrl?: string; error?: string }> {
  const token = await getValidAccessToken();
  if (!token) return { ok: false, error: "BTG não conectado. Conecte em Painel Mestre → Cobrança antes de gerar boletos." };

  try {
    const res = await fetch(`${API_BASE}/bank-slips`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        payer: { name: input.payerName, document: input.payerDocument },
        amount: input.amount,
        dueDate: input.dueDate.toISOString().slice(0, 10),
        description: input.description,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `BTG recusou a emissão (HTTP ${res.status}): ${body}` };
    }
    const json = (await res.json()) as { id?: string; boletoId?: string; url?: string; pdfUrl?: string };
    return { ok: true, boletoId: json.id ?? json.boletoId, boletoUrl: json.url ?? json.pdfUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido ao emitir boleto" };
  }
}

export async function disconnectBtg(): Promise<void> {
  await prisma.btgConnection.deleteMany({});
}
