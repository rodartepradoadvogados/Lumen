import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getOAuthClient } from "@/lib/googleDrive";
import { sendMailOutlook } from "@/lib/microsoftGraph";

export type SendEmailResult = { ok: boolean; error?: string };

/** Codifica o Subject em MIME encoded-word (UTF-8/Base64) para suportar acentos. */
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** Monta uma mensagem MIME simples em texto puro e a codifica em base64url (formato exigido pela API do Gmail). */
function buildRawMessage(from: string, to: string, subject: string, body: string): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ];
  const message = lines.join("\r\n");
  return Buffer.from(message, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Envia um e-mail de resposta ao cliente usando o provedor que a própria pessoa ESCOLHEU
 * explicitamente em Configurações (User.emailSendProvider) — conectar Google e/ou Microsoft não
 * habilita o envio sozinho; sem uma escolha explícita (ou se a conta escolhida não estiver mais
 * conectada), o envio fica desabilitado com um erro claro, em vez de cair automaticamente para o
 * outro provedor. Nunca lança: sempre resolve para { ok, ... }.
 */
export async function sendEmailReply(userId: string, to: string, subject: string, body: string): Promise<SendEmailResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailSendProvider: true } });
  if (!user?.emailSendProvider) {
    return {
      ok: false,
      error: "Nenhum provedor de e-mail escolhido para envio. Vá em Configurações → Modelos & Integrações e escolha Google ou Microsoft para habilitar o envio pelo Atendimento.",
    };
  }

  if (user.emailSendProvider === "MICROSOFT") {
    return sendMailOutlook(userId, to, subject, body);
  }

  const cred = await prisma.googleCredential.findFirst({ where: { userId } });
  if (!cred) {
    return {
      ok: false,
      error: "Você escolheu Google como provedor de envio, mas sua conta Google não está mais conectada. Vá em Configurações e reconecte.",
    };
  }

  try {
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: cred.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: client });

    const raw = buildRawMessage(cred.accountEmail, to, subject, body);
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return { ok: false, error: message };
  }
}
