import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getOAuthClient } from "@/lib/googleDrive";
import { sendMailOutlook } from "@/lib/microsoftGraph";

export type SendEmailResult = { ok: boolean; error?: string };

// Anexo real de e-mail (conteúdo já baixado do provedor de armazenamento em memória) — usado
// pelo envio de documentos por e-mail com anexo de verdade (ver
// lib/actions/documentoEnvios.ts:enviarDocumentosPorEmail). Opcional em toda a cadeia
// sendEmailReply → buildRawMessage/sendMailOutlook para não quebrar os chamadores existentes
// (lib/actions/cases.ts:sendCaseEmail, lib/actions/attendance.ts:replyEmail), que continuam
// mandando só texto.
export type EmailAttachment = { filename: string; mimeType: string; content: Buffer };

/** Codifica o Subject em MIME encoded-word (UTF-8/Base64) para suportar acentos. */
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

// Fallback ASCII do nome do arquivo para o parâmetro `filename` "clássico" (acentos removidos) —
// acompanhado sempre de `filename*` (RFC 5987, UTF-8 completo) para os clientes que já leem a
// forma estendida. Mesmo problema de acentuação que o Subject (encodeSubject acima), resolvido
// diferente porque `filename` é um parâmetro de Content-Disposition, não um header inteiro.
function asciiFallbackFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");
}

/**
 * Monta uma mensagem MIME e a codifica em base64url (formato exigido pela API do Gmail).
 * Sem anexos: texto puro simples, exatamente como antes. Com anexos: multipart/mixed, uma parte
 * text/plain (a mensagem) + uma parte por anexo (base64, Content-Disposition: attachment).
 */
function buildRawMessage(from: string, to: string, subject: string, body: string, attachments: EmailAttachment[] = []): string {
  if (attachments.length === 0) {
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

  const boundary = `----=_Lumen_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
    "",
  ];
  for (const att of attachments) {
    const asciiName = asciiFallbackFilename(att.filename);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${asciiName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      "",
      // Quebra em linhas de 76 caracteres — convenção MIME (RFC 2045) para base64, não estritamente
      // exigida pelo Gmail, mas evita header/linha absurdamente longa em clientes mais rígidos.
      att.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      ""
    );
  }
  lines.push(`--${boundary}--`);
  const message = lines.join("\r\n");
  return Buffer.from(message, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Envia um e-mail de resposta ao cliente usando o provedor que a própria pessoa ESCOLHEU
 * explicitamente em Configurações (User.emailSendProvider) — conectar Google e/ou Microsoft não
 * habilita o envio sozinho; sem uma escolha explícita (ou se a conta escolhida não estiver mais
 * conectada), o envio fica desabilitado com um erro claro, em vez de cair automaticamente para o
 * outro provedor. Nunca lança: sempre resolve para { ok, ... }.
 *
 * `attachments` é opcional — quem não passa nada continua recebendo o mesmo comportamento de
 * sempre (e-mail em texto puro), usado por lib/actions/cases.ts:sendCaseEmail e
 * lib/actions/attendance.ts:replyEmail. Quem passa (lib/actions/documentoEnvios.ts) recebe anexo
 * real, via Gmail (raw multipart) ou Outlook (campo attachments da Graph API), conforme o
 * provedor escolhido.
 */
export async function sendEmailReply(
  userId: string,
  to: string,
  subject: string,
  body: string,
  attachments: EmailAttachment[] = []
): Promise<SendEmailResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailSendProvider: true } });
  if (!user?.emailSendProvider) {
    return {
      ok: false,
      error: "Nenhum provedor de e-mail escolhido para envio. Vá em Conexões e escolha Google ou Microsoft para habilitar o envio pelo Atendimento.",
    };
  }

  if (user.emailSendProvider === "MICROSOFT") {
    return sendMailOutlook(userId, to, subject, body, attachments);
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

    const raw = buildRawMessage(cred.accountEmail, to, subject, body, attachments);
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return { ok: false, error: message };
  }
}
