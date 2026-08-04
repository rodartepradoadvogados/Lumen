// Integração com a Microsoft (Outlook/OneDrive) via Microsoft Graph — "env-gated" como o
// BTG/WhatsApp/Push: dormente e inofensivo enquanto MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET
// não estiverem cadastrados. Cobre e-mail (leitura para o pipeline de publicações, envio no
// Atendimento) — mesma lógica de "cada pessoa conecta a própria caixa" do GoogleCredential modo
// Jusbrasil (lib/googleDrive.ts:saveJusbrasilTokensFromCode). O escopo Files.ReadWrite já é
// pedido no consentimento (mesmo app/registro do Azure AD) desde a Fase 1, de propósito, para o
// OneDrive não exigir uma segunda rodada de autorização — agora USADO por lib/oneDriveStorage.ts
// (Fase 2, armazenamento), que reaproveita exchangeMicrosoftCodeForTokens/getMicrosoftAccessToken
// abaixo (exportados daqui pra não duplicar o fluxo OAuth). O calendário do Outlook segue de fora.
import { prisma } from "@/lib/prisma";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// offline_access: necessário pra ganhar refresh_token. Mail.Read/Mail.Send: espelham
// gmail.readonly/gmail.send do lado Google. Files.ReadWrite: OneDrive (Fase 2 — armazenamento,
// ver lib/oneDriveStorage.ts).
const SCOPES = ["offline_access", "Mail.Read", "Mail.Send", "Files.ReadWrite", "User.Read"].join(" ");

export function isMicrosoftConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function redirectUri(): string {
  return process.env.MICROSOFT_REDIRECT_URI || "https://lumen-flax-chi.vercel.app/api/microsoft/callback";
}

export function getMicrosoftAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: SCOPES,
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

// Compartilhado com lib/oneDriveStorage.ts (Fase 2 — armazenamento): troca o code OAuth por
// tokens e descobre o e-mail da conta. Exportada (e renomeada, de "exchangeCodeForTokens") para
// deixar claro no ponto de import que é um utilitário Microsoft genérico, não específico de e-mail.
export async function exchangeMicrosoftCodeForTokens(code: string): Promise<{ accountEmail: string; refreshToken: string }> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft recusou o código de autorização (${res.status}): ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.refresh_token) {
    throw new Error("A Microsoft não retornou um refresh_token. Tente conectar novamente.");
  }

  const me = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!me.ok) throw new Error("Não foi possível obter o e-mail da conta Microsoft.");
  const meData = (await me.json()) as { mail?: string; userPrincipalName?: string };
  const accountEmail = meData.mail || meData.userPrincipalName;
  if (!accountEmail) throw new Error("A conta Microsoft não tem um e-mail associado.");

  return { accountEmail, refreshToken: tokens.refresh_token };
}

// Conecta a caixa de e-mail Outlook da pessoa logada — usada tanto para o pipeline de
// publicações (lib/outlookEmailSync.ts) quanto para envio no Atendimento (lib/gmailSend.ts).
export async function saveMicrosoftTokensFromCode(code: string, userId: string, officeId: string): Promise<void> {
  const { accountEmail, refreshToken } = await exchangeMicrosoftCodeForTokens(code);

  const existingByEmail = await prisma.microsoftCredential.findUnique({ where: { accountEmail } });
  if (existingByEmail && existingByEmail.officeId !== officeId) {
    throw new Error("Esta conta Microsoft já está conectada a outro escritório na plataforma.");
  }

  await prisma.microsoftCredential.upsert({
    where: { accountEmail },
    update: { refreshToken, userId, officeId },
    create: { accountEmail, refreshToken, userId, officeId },
  });
}

// Compartilhado com lib/oneDriveStorage.ts — renova o access token via refresh_token (mesmo
// mecanismo do e-mail, sem nenhuma diferença por escopo: um único token da conta serve tanto
// para Mail.* quanto para Files.ReadWrite, já que os dois foram pedidos juntos no consentimento).
export async function getMicrosoftAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao renovar o token da Microsoft (${res.status}): ${await res.text()}`);
  const tokens = (await res.json()) as TokenResponse;
  return tokens.access_token;
}

export async function listMicrosoftAccounts(officeId: string) {
  const creds = await prisma.microsoftCredential.findMany({
    where: { officeId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
  return creds.map((c) => ({ id: c.id, accountEmail: c.accountEmail, userId: c.userId, ownerName: c.user?.name ?? null }));
}

export type OutlookMessage = {
  id: string;
  internetMessageId: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  bodyText: string;
};

// Lista mensagens da caixa de entrada recebidas desde `sinceDate`, já com o corpo em texto
// puro (header Prefer: outlook.body-content-type="text" evita ter que converter HTML como o
// lado Gmail faz com mailparser). $filter usa receivedDateTime — sintaxe OData, diferente da
// busca por texto livre (`after:`/`from:`) usada nas queries do Gmail.
async function listMessagesSince(accessToken: string, sinceDate: Date): Promise<OutlookMessage[]> {
  const messages: OutlookMessage[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/me/mailFolders/inbox/messages?$select=id,internetMessageId,subject,from,receivedDateTime,body&$filter=${encodeURIComponent(
      `receivedDateTime ge ${sinceDate.toISOString()}`
    )}&$top=50&$orderby=receivedDateTime asc`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!res.ok) throw new Error(`Falha ao listar mensagens do Outlook (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as {
      value: { id: string; internetMessageId?: string; subject?: string; from?: { emailAddress?: { address?: string } }; receivedDateTime: string; body?: { content?: string } }[];
      "@odata.nextLink"?: string;
    };
    for (const m of data.value) {
      messages.push({
        id: m.id,
        internetMessageId: m.internetMessageId || `outlook-${m.id}`,
        subject: m.subject || "",
        from: m.from?.emailAddress?.address?.toLowerCase() || "",
        receivedDateTime: m.receivedDateTime,
        bodyText: m.body?.content || "",
      });
    }
    url = data["@odata.nextLink"];
  }
  return messages;
}

export async function getOutlookMessagesForOffice(cred: { refreshToken: string }, sinceDate: Date): Promise<OutlookMessage[]> {
  const accessToken = await getMicrosoftAccessToken(cred.refreshToken);
  return listMessagesSince(accessToken, sinceDate);
}

export type SendMailResult = { ok: boolean; error?: string };

// Mesmo tipo de lib/gmailSend.ts:EmailAttachment (conteúdo já baixado em memória) — duplicado em
// vez de importado para não criar uma dependência circular entre os dois arquivos (gmailSend.ts
// já importa sendMailOutlook daqui); a forma estrutural idêntica ({filename,mimeType,content}) é
// o que importa, não o nome do tipo.
export type MailAttachment = { filename: string; mimeType: string; content: Buffer };

// Envia e-mail pela caixa Outlook do próprio usuário — equivalente a lib/gmailSend.ts, usado
// pelo Atendimento quando a pessoa conectou Outlook em vez de (ou além de) Gmail. `attachments`
// é opcional (mesma razão de lib/gmailSend.ts:sendEmailReply): quem não passa nada continua com
// o comportamento de sempre; lib/actions/documentoEnvios.ts passa o conteúdo real dos documentos
// selecionados, via o campo `attachments` (fileAttachment/contentBytes) da Graph API.
export async function sendMailOutlook(
  userId: string,
  to: string,
  subject: string,
  body: string,
  attachments: MailAttachment[] = []
): Promise<SendMailResult> {
  const cred = await prisma.microsoftCredential.findFirst({ where: { userId } });
  if (!cred) return { ok: false, error: "Você ainda não conectou sua conta Microsoft (Outlook)." };

  try {
    const accessToken = await getMicrosoftAccessToken(cred.refreshToken);
    const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: body },
          toRecipients: [{ emailAddress: { address: to } }],
          ...(attachments.length > 0
            ? {
                attachments: attachments.map((a) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: a.filename,
                  contentType: a.mimeType,
                  contentBytes: a.content.toString("base64"),
                })),
              }
            : {}),
        },
        saveToSentItems: true,
      }),
    });
    if (!res.ok) return { ok: false, error: `Outlook recusou o envio (${res.status}): ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" };
  }
}
