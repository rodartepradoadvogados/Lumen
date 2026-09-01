import nodemailer from "nodemailer";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { valorLiquido } from "@/lib/financeCalc";
import { getOAuthClient } from "@/lib/googleDrive";
import { getMicrosoftAccessToken } from "@/lib/microsoftGraph";
import { escapeHtml } from "@/lib/htmlEscape";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}

function getTransporter() {
  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT || 465);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

// ============================================================================
// Cascata de envio para e-mails CRÍTICOS de acesso (hoje só a redefinição de senha, ver
// sendPasswordResetEmail abaixo) — diferente dos e-mails de aviso acima, que dependem só de
// SMTP e ficam quietamente "não enviados" se EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD faltarem.
// Perder o e-mail de redefinição tranca a pessoa fora do sistema, então aqui existe uma
// cascata de 3 canais antes de desistir:
//   1) SMTP dedicado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD) — se configurado, é o canal
//      previsível e sempre tentado primeiro;
//   2) conta Google conectada do ESCRITÓRIO (GoogleCredential) — reaproveita o escopo
//      gmail.send já concedido para o Drive (ver lib/googleDrive.ts), sem exigir nenhuma
//      conexão nova; escolhe a conta isPrimaryDrive quando existir, senão a mais antiga;
//   3) conta Microsoft conectada do escritório (MicrosoftCredential) — mesma ideia do lado
//      Outlook (Mail.Send, ver lib/microsoftGraph.ts), última tentativa antes de desistir.
// Se as três falharem (ou nenhuma existir), devolve `sent:false` com uma explicação e a
// orientação de usar o link gerado por um administrador (ver adminGenerateResetLink em
// lib/actions/auth.ts) — o caminho que não depende de e-mail nenhum.
// ============================================================================

/** Codifica o Subject em MIME encoded-word (UTF-8/Base64) — mesmo truque de lib/gmailSend.ts. */
function encodeMimeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

/** Monta e envia um e-mail HTML através da API do Gmail, usando o refresh_token de uma conta
 * Google já conectada (GoogleCredential) — variação de lib/gmailSend.ts:buildRawMessage, que só
 * suporta texto puro; aqui o corpo é HTML (mesmo template dos e-mails de SMTP acima). */
async function sendViaGmailAccount(refreshToken: string, fromEmail: string, to: string, subject: string, html: string): Promise<void> {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth: client });

  const lines = [
    `From: "Lúmen" <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

/** Envia um e-mail HTML pela Microsoft Graph usando o refresh_token de uma conta Microsoft já
 * conectada (MicrosoftCredential) — variação de lib/microsoftGraph.ts:sendMailOutlook, que busca
 * a credencial por userId; aqui a credencial já vem escolhida (nível de escritório, não de
 * pessoa) pela cascata abaixo. */
async function sendViaOutlookAccount(refreshToken: string, to: string, subject: string, html: string): Promise<void> {
  const accessToken = await getMicrosoftAccessToken(refreshToken);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`Outlook recusou o envio (${res.status}): ${await res.text()}`);
}

async function sendCriticalEmailCascade(officeId: string, to: string, subject: string, html: string): Promise<{ sent: boolean; reason?: string }> {
  const attempts: string[] = [];

  const transporter = getTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({ from: `"Lúmen" <${process.env.EMAIL_USER}>`, to, subject, html });
      return { sent: true };
    } catch (e) {
      attempts.push(`SMTP: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }

  const googleCred = await prisma.googleCredential.findFirst({ where: { officeId }, orderBy: { isPrimaryDrive: "desc" } });
  if (googleCred) {
    try {
      await sendViaGmailAccount(googleCred.refreshToken, googleCred.accountEmail, to, subject, html);
      return { sent: true };
    } catch (e) {
      attempts.push(`Google (${googleCred.accountEmail}): ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }

  const microsoftCred = await prisma.microsoftCredential.findFirst({ where: { officeId }, orderBy: { isPrimaryDrive: "desc" } });
  if (microsoftCred) {
    try {
      await sendViaOutlookAccount(microsoftCred.refreshToken, to, subject, html);
      return { sent: true };
    } catch (e) {
      attempts.push(`Microsoft (${microsoftCred.accountEmail}): ${e instanceof Error ? e.message : "erro desconhecido"}`);
    }
  }

  if (attempts.length > 0) {
    console.error(`[sendCriticalEmailCascade] todas as tentativas falharam para ${to}:`, attempts.join(" | "));
  }
  return {
    sent: false,
    reason:
      "Não foi possível enviar o e-mail agora (nenhum canal de envio disponível ou configurado). Peça a um administrador para gerar seu link de acesso em Configurações → Equipe.",
  };
}

const typeLabels: Record<string, string> = { TAREFA: "Tarefa", EVENTO: "Evento", AUDIENCIA: "Audiência", PERICIA: "Perícia", PRAZO: "Prazo" };

export async function buildDailyAgendaHtml(officeId: string, officeName: string) {
  const now = new Date();
  const [tasks, publications] = await Promise.all([
    prisma.task.findMany({
      where: { officeId, dueDate: { gte: startOfDay(now), lte: endOfDay(now) }, status: { not: "CANCELADO" } },
      include: { case: true, responsible: true },
      orderBy: [{ dueTime: "asc" }],
    }),
    // "Capturadas hoje": usa createdAt (quando entrou no site via e-mail/robô), não publishedAt
    // (que pode ser retroativo à data real da publicação no diário oficial).
    prisma.publication.findMany({
      where: { officeId, createdAt: { gte: startOfDay(now), lte: endOfDay(now) } },
      include: { case: true },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const rows = tasks
    .map(
      (t) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#0f1f3d;">${t.dueTime ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;"><span style="background:#f3efe6;color:#8a6a1f;padding:2px 8px;border-radius:10px;font-weight:600;">${typeLabels[t.type] ?? t.type}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#0f1f3d;">${escapeHtml(t.title)}${t.case ? `<br/><span style="color:#888;font-size:12px;">${escapeHtml(t.case.title)}</span>` : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${escapeHtml(t.responsible?.name) || "—"}</td>
      </tr>`
    )
    .join("");

  const pubKindLabels: Record<string, string> = { PUBLICACAO: "Publicação", ANDAMENTO: "Andamento" };
  const pubRows = publications
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;"><span style="background:#f3efe6;color:#8a6a1f;padding:2px 8px;border-radius:10px;font-weight:600;">${pubKindLabels[p.kind] ?? p.kind}</span> <span style="color:#999;font-size:11px;">${escapeHtml(p.source)}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#0f1f3d;">${escapeHtml(p.content.slice(0, 220))}${p.content.length > 220 ? "…" : ""}${p.case ? `<br/><span style="color:#888;font-size:12px;">${escapeHtml(p.case.title)}</span>` : ""}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">${officeName.toUpperCase()}</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">AGENDA DO DIA</p>
    </div>
    <div style="padding:20px;background:#fff;">
      <p style="font-family:Arial,sans-serif;font-size:14px;color:#0f1f3d;text-transform:capitalize;">${dateLabel}</p>
      ${
        tasks.length === 0
          ? `<p style="font-family:Arial,sans-serif;color:#888;">Nenhum compromisso agendado para hoje.</p>`
          : `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
              <thead>
                <tr style="background:#f3efe6;">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#0f1f3d;">Hora</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#0f1f3d;">Tipo</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#0f1f3d;">Compromisso</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#0f1f3d;">Responsável</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
      }
      <p style="font-family:Arial,sans-serif;font-size:13px;color:#0f1f3d;font-weight:700;margin:24px 0 8px;">Publicações e andamentos capturados hoje</p>
      ${
        publications.length === 0
          ? `<p style="font-family:Arial,sans-serif;color:#888;">Nenhuma publicação ou andamento capturado hoje.</p>`
          : `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
              <thead>
                <tr style="background:#f3efe6;">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#0f1f3d;">Tipo / fonte</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;color:#0f1f3d;">Conteúdo</th>
                </tr>
              </thead>
              <tbody>${pubRows}</tbody>
            </table>`
      }
    </div>
  </div>`;
}

// officeId é usado só pela cascata (passo 2/3, contas conectadas do escritório) quando o SMTP
// (passo 1) não estiver configurado ou falhar — ver sendCriticalEmailCascade acima.
export async function sendPasswordResetEmail(to: string, resetUrl: string, officeName: string, officeId: string): Promise<{ sent: boolean; reason?: string }> {
  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">${officeName.toUpperCase()}</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">REDEFINIÇÃO DE SENHA</p>
    </div>
    <div style="padding:20px;background:#fff;font-family:Arial,sans-serif;">
      <p style="font-size:14px;color:#0f1f3d;">Recebemos um pedido para redefinir a senha da sua conta no sistema.</p>
      <p style="font-size:14px;color:#0f1f3d;">Clique no botão abaixo para escolher uma nova senha. Este link expira em 1 hora.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="background:#0b1730;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Redefinir minha senha</a>
      </p>
      <p style="font-size:12px;color:#888;">Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha atual continua válida.</p>
    </div>
  </div>`;

  return sendCriticalEmailCascade(officeId, to, "Redefinição de senha — Sistema Interno", html);
}

// E-mail diário da agenda: quando chamado sem officeId (uso do cron — ver
// app/api/cron/daily-agenda/route.ts), envia UM e-mail por escritório, cada um só com os
// compromissos daquele escritório e só para os administradores dele. Quando chamado com
// officeId (botão "Testar" em Configurações → Geral), envia só para aquele escritório.
export async function sendDailyAgendaEmail(officeId?: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }
  const offices = officeId ? await prisma.office.findMany({ where: { id: officeId } }) : await prisma.office.findMany();
  if (offices.length === 0) {
    return { sent: false, reason: "Nenhum escritório cadastrado." };
  }

  let anySent = false;
  let lastReason: string | undefined;
  for (const office of offices) {
    const admins = await prisma.user.findMany({
      where: { officeId: office.id, isAdmin: true, active: true },
      select: { email: true },
    });
    const to = admins.map((a) => a.email).join(",");
    if (!to) {
      lastReason = `Escritório "${office.name}" não tem administrador com e-mail cadastrado.`;
      continue;
    }
    const html = await buildDailyAgendaHtml(office.id, office.name);
    try {
      await transporter.sendMail({
        from: `"${office.name}" <${process.env.EMAIL_USER}>`,
        to,
        subject: `Agenda do dia — ${new Date().toLocaleDateString("pt-BR")}`,
        html,
      });
      anySent = true;
    } catch (e) {
      lastReason = e instanceof Error ? e.message : "erro desconhecido ao enviar";
    }
  }
  if (!anySent) return { sent: false, reason: lastReason };
  return { sent: true };
}

// Envio genérico SMTP-only (sem cascata de contas conectadas — ver sendCriticalEmailCascade
// acima, reservada a e-mail de acesso crítico) — usado pelo drenador de NotificationOutbox
// (documento 06, Fase 3) pra montar o resumo diário sem duplicar a lógica de transporte/erro já
// existente aqui. "Quietamente não enviado" se EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD faltarem,
// mesmo padrão dos demais e-mails de aviso deste arquivo.
export async function sendSimpleEmail(to: string, subject: string, html: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  try {
    await transporter.sendMail({ from: `"Lúmen" <${process.env.EMAIL_USER}>`, to, subject, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "erro desconhecido ao enviar" };
  }
}

// Convite de um escritório novo (Painel Mestre → "Criar e enviar 1ª fatura"): igual ao link
// de redefinição de senha (mesmo token/expiração), só com o texto voltado a "defina sua
// senha" em vez de "redefina" — a pessoa nunca teve senha antes.
export async function sendOfficeInviteEmail(to: string, adminName: string, resetUrl: string, officeName: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">LÚMEN</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">BEM-VINDO(A)</p>
    </div>
    <div style="padding:20px;background:#fff;font-family:Arial,sans-serif;">
      <p style="font-size:14px;color:#0f1f3d;">Olá, ${adminName}!</p>
      <p style="font-size:14px;color:#0f1f3d;">O escritório <strong>${officeName}</strong> já está cadastrado no Lúmen. Clique no botão abaixo para definir sua senha de acesso — o link expira em 1 hora.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="background:#0b1730;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Definir minha senha</a>
      </p>
      <p style="font-size:12px;color:#888;">Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>
    </div>
  </div>`;

  try {
    await transporter.sendMail({ from: `"Lúmen" <${process.env.EMAIL_USER}>`, to, subject: `Bem-vindo ao Lúmen — ${officeName}`, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "erro desconhecido ao enviar" };
  }
}

// Shape comum do Pix (QR Code dinâmico) usado pelos e-mails de cobrança — mesmo formato de
// TenantInvoice.pixQrCodePayload/pixQrCodeImage.
type PixEmailOpts = { pixPayload?: string | null; pixImage?: string | null };

// Bloco HTML do Pix (copia-e-cola selecionável + QR Code inline), reaproveitado pelos três
// e-mails de cobrança abaixo que podem carregar Pix (fatura, lembrete antes do vencimento e
// lembrete de vencida). Ausente quando não há pixPayload.
function pixHtmlBlock(opts?: PixEmailOpts | null): string {
  if (!opts?.pixPayload) return "";
  return `
      <div style="margin:20px 0;padding:16px;background:#f3efe6;border-radius:8px;text-align:center;">
        <p style="font-size:13px;color:#0f1f3d;font-weight:700;margin:0 0 8px;">Pagar com Pix</p>
        ${opts.pixImage ? `<img src="data:image/png;base64,${opts.pixImage}" alt="QR Code Pix" style="width:180px;height:180px;margin:0 auto 8px;display:block;" />` : ""}
        <p style="font-size:12px;color:#555;margin:0 0 4px;">Pix Copia e Cola:</p>
        <p style="font-size:11px;color:#0f1f3d;word-break:break-all;background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px;margin:0;user-select:all;">${opts.pixPayload}</p>
      </div>`;
}

// Fatura mensal de um escritório-cliente (Painel Mestre) — com boleto anexado quando o BTG
// já emitiu (boletoUrl), com Pix (QR Code + copia-e-cola) quando a Asaas já gerou (opts), ou só
// o valor/vencimento quando nenhum dos dois (cobrança fica combinada por fora).
export async function sendInvoiceEmail(
  to: string,
  officeName: string,
  amount: number,
  dueDate: Date,
  boletoUrl?: string | null,
  opts?: PixEmailOpts
): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

  const amountLabel = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dueLabel = dueDate.toLocaleDateString("pt-BR");

  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">LÚMEN</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">FATURA MENSAL</p>
    </div>
    <div style="padding:20px;background:#fff;font-family:Arial,sans-serif;">
      <p style="font-size:14px;color:#0f1f3d;">Olá! Segue a fatura referente à mensalidade do Lúmen — ${officeName}.</p>
      <p style="font-size:14px;color:#0f1f3d;">Valor: <strong>${amountLabel}</strong><br/>Vencimento: <strong>${dueLabel}</strong></p>
      ${pixHtmlBlock(opts)}
      ${
        boletoUrl
          ? `<p style="text-align:center;margin:24px 0;"><a href="${boletoUrl}" style="background:#0b1730;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver boleto</a></p>`
          : opts?.pixPayload
            ? ""
            : `<p style="font-size:13px;color:#888;">O boleto será combinado diretamente com o Rodarte Prado Advogados.</p>`
      }
    </div>
  </div>`;

  try {
    await transporter.sendMail({ from: `"Rodarte Prado Advogados" <${process.env.EMAIL_USER}>`, to, subject: `Fatura Lúmen — ${officeName} — vence em ${dueLabel}`, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "erro desconhecido ao enviar" };
  }
}

// Lembrete enviado 3 dias antes do vencimento (Fase 2 — cron de cobrança, ver
// lib/actions/billing.ts:runBillingCycle). Mesmo estilo/tom de sendInvoiceEmail, focado em
// avisar que a fatura vence em breve.
export async function sendPaymentReminderEmail(
  to: string,
  officeName: string,
  amount: number,
  dueDate: Date,
  opts?: PixEmailOpts & { boletoUrl?: string | null }
): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

  const amountLabel = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dueLabel = dueDate.toLocaleDateString("pt-BR");

  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">LÚMEN</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">LEMBRETE DE FATURA</p>
    </div>
    <div style="padding:20px;background:#fff;font-family:Arial,sans-serif;">
      <p style="font-size:14px;color:#0f1f3d;">Olá! A fatura da mensalidade do Lúmen — ${officeName} vence em breve.</p>
      <p style="font-size:14px;color:#0f1f3d;">Valor: <strong>${amountLabel}</strong><br/>Vencimento: <strong>${dueLabel}</strong></p>
      ${pixHtmlBlock(opts)}
      ${
        opts?.boletoUrl
          ? `<p style="text-align:center;margin:24px 0;"><a href="${opts.boletoUrl}" style="background:#0b1730;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver boleto</a></p>`
          : ""
      }
      <p style="font-size:13px;color:#888;">Se o pagamento já foi feito, pode ignorar este lembrete.</p>
    </div>
  </div>`;

  try {
    await transporter.sendMail({ from: `"Rodarte Prado Advogados" <${process.env.EMAIL_USER}>`, to, subject: `Lembrete — fatura Lúmen vence em ${dueLabel}`, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "erro desconhecido ao enviar" };
  }
}

// Enviado no dia do vencimento (ou logo depois) se a fatura ainda estiver PENDENTE, avisando
// quantos dias faltam até o bloqueio automático por inadimplência (Fase 2 — cron de cobrança).
export async function sendOverdueReminderEmail(
  to: string,
  officeName: string,
  amount: number,
  dueDate: Date,
  graceDaysLeft: number,
  opts?: PixEmailOpts & { boletoUrl?: string | null }
): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

  const amountLabel = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dueLabel = dueDate.toLocaleDateString("pt-BR");
  const prazoLabel =
    graceDaysLeft <= 0
      ? "hoje é o último dia antes do bloqueio automático do acesso"
      : `faltam ${graceDaysLeft} dia${graceDaysLeft === 1 ? "" : "s"} até o bloqueio automático do acesso`;

  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">LÚMEN</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">FATURA VENCIDA</p>
    </div>
    <div style="padding:20px;background:#fff;font-family:Arial,sans-serif;">
      <p style="font-size:14px;color:#0f1f3d;">A fatura da mensalidade do Lúmen — ${officeName} venceu em <strong>${dueLabel}</strong> e ainda não identificamos o pagamento.</p>
      <p style="font-size:14px;color:#0f1f3d;">Valor: <strong>${amountLabel}</strong></p>
      <p style="font-size:14px;color:#0f1f3d;font-weight:700;">${prazoLabel}.</p>
      ${pixHtmlBlock(opts)}
      ${
        opts?.boletoUrl
          ? `<p style="text-align:center;margin:24px 0;"><a href="${opts.boletoUrl}" style="background:#0b1730;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver boleto</a></p>`
          : ""
      }
      <p style="font-size:13px;color:#888;">Se o pagamento já foi feito, pode ignorar este lembrete — a confirmação pode levar algumas horas para refletir aqui.</p>
    </div>
  </div>`;

  try {
    await transporter.sendMail({ from: `"Rodarte Prado Advogados" <${process.env.EMAIL_USER}>`, to, subject: `Fatura Lúmen vencida — ${officeName}`, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "erro desconhecido ao enviar" };
  }
}

// Enviado no momento em que o escritório é efetivamente bloqueado por inadimplência (Fase 2 —
// cron de cobrança). Mesmo tom do texto já usado na tela de bloqueio em app/(app)/layout.tsx.
export async function sendOfficeSuspendedEmail(to: string, officeName: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">LÚMEN</h1>
      <p style="color:#c6a05c;font-size:11px;letter-spacing:3px;margin:4px 0 0;">ACESSO SUSPENSO</p>
    </div>
    <div style="padding:20px;background:#fff;font-family:Arial,sans-serif;">
      <p style="font-size:14px;color:#0f1f3d;">O acesso do escritório <strong>${officeName}</strong> ao Lúmen foi suspenso por falta de pagamento da mensalidade.</p>
      <p style="font-size:14px;color:#0f1f3d;">Entre em contato com o Rodarte Prado Advogados para regularizar a situação e liberar o acesso novamente.</p>
    </div>
  </div>`;

  try {
    await transporter.sendMail({ from: `"Rodarte Prado Advogados" <${process.env.EMAIL_USER}>`, to, subject: `Acesso suspenso — Lúmen — ${officeName}`, html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "erro desconhecido ao enviar" };
  }
}

// ============================================================================
// Resumo diário por e-mail (7h, cron em app/api/cron/resumo-diario) — pessoal por advogado,
// bem diferente de buildDailyAgendaHtml/sendDailyAgendaEmail acima (que é por ESCRITÓRIO
// inteiro e só vai pros administradores): aqui todo usuário ativo recebe o PRÓPRIO resumo —
// notificações não lidas (menções + tarefas delegadas ainda não vistas), e os prazos/
// tarefas dos quais ELE é responsável (atrasados e os de hoje). Quem é administrador
// (User.isAdmin) ganha, além disso, o financeiro do dia (contas a pagar/receber vencendo
// hoje) — o resto do escritório não vê essa seção.
// ============================================================================

const LUMEN_LOGO_BASE64 = "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";

type DigestListItem = { title: string; subtitle?: string; meta: string; urgent?: boolean };
type DigestFinanceRow = { label: string; sub: string; amount: number; kind: "pagar" | "receber" };

function digestSection(opts: { color: string; title: string; count: number; items: DigestListItem[]; emptyLabel: string }): string {
  const rows = opts.items
    .map(
      (i) => `
      <div style="border-bottom:1px solid #ece7d9;padding:10px 2px;">
        <p style="font-size:13.5px;color:#0a1128;margin:0 0 2px;line-height:1.4;">${
          i.urgent
            ? `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9px;margin-right:7px;background:#fbe9e6;color:#8a1f1f;">${escapeHtml(i.meta)}</span>`
            : `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9px;margin-right:7px;background:#ece3d2;color:#7a5c14;">${escapeHtml(i.meta)}</span>`
        }${escapeHtml(i.title)}</p>
        ${i.subtitle ? `<p style="font-size:11.5px;color:#948e7d;margin:0;">${escapeHtml(i.subtitle)}</p>` : ""}
      </div>`
    )
    .join("");

  return `
  <div style="margin:0 0 26px;">
    <div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;">
      <span style="width:7px;height:7px;border-radius:50%;background:${opts.color};display:inline-block;"></span>
      <p style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;margin:0;color:${opts.color};">${opts.title} <span style="font-size:11px;color:#9a9484;font-weight:400;letter-spacing:0;text-transform:none;">— ${opts.count}</span></p>
    </div>
    ${opts.items.length === 0 ? `<p style="font-size:12.5px;color:#a39d8c;font-style:italic;padding:4px 2px 2px;">${opts.emptyLabel}</p>` : rows}
  </div>`;
}

function digestFinanceSection(rows: DigestFinanceRow[]): string {
  const total = rows.reduce((acc, r) => acc + (r.kind === "receber" ? r.amount : -r.amount), 0);
  const positive = total >= 0;
  const money = (v: number) => `R$ ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const body =
    rows.length === 0
      ? `<p style="font-size:12.5px;color:#a39d8c;font-style:italic;padding:4px 2px 2px;">Nada vencendo hoje.</p>`
      : `
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      ${rows
        .map(
          (r) => `
      <tr>
        <td style="padding:7px 2px;border-bottom:1px solid #ece7d9;color:#0a1128;">${r.kind === "pagar" ? "A pagar" : "A receber"}<br/><span style="color:#948e7d;font-size:11px;">${escapeHtml(r.label)}${r.sub ? ` — ${escapeHtml(r.sub)}` : ""}</span></td>
        <td style="padding:7px 2px;border-bottom:1px solid #ece7d9;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap;color:${r.kind === "pagar" ? "#8a1f1f" : "#2f6b4f"};">${r.kind === "pagar" ? "− " : "+ "}${money(r.amount)}</td>
      </tr>`
        )
        .join("")}
    </table>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;padding:10px 12px;border-radius:8px;background:${positive ? "#e6f1ea" : "#fbe9e6"};">
      <span style="font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:${positive ? "#2f6b4f" : "#8a1f1f"};">Saldo do dia</span>
      <span style="font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;color:${positive ? "#2f6b4f" : "#8a1f1f"};">${positive ? "+ " : "− "}${money(total)}</span>
    </div>`;

  return `
  <div style="margin:0 0 26px;">
    <div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;">
      <span style="width:7px;height:7px;border-radius:50%;background:#445070;display:inline-block;"></span>
      <p style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;margin:0;color:#445070;">Financeiro do dia</p>
    </div>
    ${body}
  </div>`;
}

function buildDailyDigestHtml(params: {
  firstName: string;
  dateLabel: string;
  notifications: DigestListItem[];
  overdue: DigestListItem[];
  today: DigestListItem[];
  finance: DigestFinanceRow[] | null;
}): string {
  return `
  <div style="width:600px;max-width:100%;margin:0 auto;background:#ffffff;font-family:Georgia,'Times New Roman',serif;">
    <div style="background:#0a1128;padding:28px 32px 24px;text-align:center;">
      <img src="data:image/png;base64,${LUMEN_LOGO_BASE64}" width="46" height="46" alt="Lúmen" style="width:46px;height:46px;border-radius:10px;display:block;margin:0 auto 10px;" />
      <p style="color:#ffffff;font-size:25px;margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:0.01em;">Lúmen</p>
      <p style="color:#8f1c38;font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:3.5px;margin:5px 0 0;font-weight:700;">GESTÃO&nbsp;JURÍDICA</p>
    </div>
    <div style="padding:28px 32px 8px;font-family:Arial,sans-serif;">
      <p style="font-family:Georgia,serif;font-size:17px;color:#0a1128;margin:0 0 2px;">Bom dia, ${params.firstName}</p>
      <p style="font-size:12.5px;color:#7c7666;margin:0 0 26px;text-transform:capitalize;">${params.dateLabel}</p>

      ${digestSection({ color: "#0a1128", title: "Notificações não lidas", count: params.notifications.length, items: params.notifications, emptyLabel: "Nenhuma notificação pendente." })}
      ${digestSection({ color: "#6e0d25", title: "Atrasados", count: params.overdue.length, items: params.overdue, emptyLabel: "Nenhum prazo atrasado." })}
      ${digestSection({ color: "#b8860b", title: "Hoje", count: params.today.length, items: params.today, emptyLabel: "Nenhum compromisso para hoje." })}
      ${params.finance ? digestFinanceSection(params.finance) : ""}
    </div>
    <div style="background:#f4efe4;border-top:3px solid #6e0d25;padding:18px 32px 22px;margin-top:18px;">
      <p style="font-family:Arial,sans-serif;font-size:11px;color:#5c5748;margin:0 0 8px;"><span style="margin-right:14px;">lumen.com.br</span><span style="margin-right:14px;">contato@lumen.com.br</span><span>+55 62 0000-0000</span></p>
      <p style="font-family:Arial,sans-serif;font-size:10.5px;color:#9a947f;margin:0;line-height:1.5;">Você recebe este resumo porque tem uma conta ativa no Lúmen.</p>
    </div>
  </div>`;
}

// Uma linha por tarefa/prazo, no mesmo formato usado tanto em "Atrasados" quanto em "Hoje" —
// `meta` é a etiqueta colorida (tipo + horário para hoje, "X dia(s)" para atrasado).
function taskToDigestItem(t: { title: string; type: string; dueTime: string | null; dueDate: Date; case: { title: string } | null }, meta: string, urgent: boolean): DigestListItem {
  return { title: t.title, subtitle: t.case?.title, meta, urgent };
}

function daysLate(dueDate: Date, now: Date): number {
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

// Ponto de entrada do cron (app/api/cron/resumo-diario/route.ts) — manda UM e-mail por
// usuário ativo (não por escritório, ao contrário de sendDailyAgendaEmail), sempre com os 3
// blocos pessoais, mais o financeiro do dia só para quem for administrador (User.isAdmin).
// `officeId`: quando informado, manda só para os usuários daquele escritório (uso do botão
// "Testar" em Configurações, análogo ao que já existe para a Agenda do Dia).
export async function sendDailyDigestEmails(officeId?: string): Promise<{ sent: number; failed: number }> {
  const transporter = getTransporter();
  if (!transporter) return { sent: 0, failed: 0 };

  const users = await prisma.user.findMany({
    where: { active: true, ...(officeId ? { officeId } : {}) },
    select: { id: true, name: true, email: true, officeId: true, isAdmin: true },
  });
  if (users.length === 0) return { sent: 0, failed: 0 };

  const now = new Date();
  const dateLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const [mentions, delegatedTasks, overdueTasks, todayTasks, payablesToday, receivablesToday] = await Promise.all([
        // Mesmas duas fontes que o digest de fato usa (era getAlerts inteiro, montado pra
        // Central de Alertas — 12 queries, a maioria OFFICE-WIDE, repetidas por usuário do
        // mesmo escritório e descartadas: o digest só lê MENCAO e TAREFA_DELEGADA). Direto nas
        // duas fontes por usuário, mesmo shape de lib/alerts.ts:182 e :203-207.
        prisma.mention.findMany({
          where: { officeId: user.officeId, userId: user.id, read: false },
          include: { comment: { include: { author: true } } },
        }),
        prisma.task.findMany({
          where: { officeId: user.officeId, responsibleId: user.id, delegatedById: { not: null }, delegationAcknowledgedAt: null },
          include: { case: true, delegatedBy: true },
        }),
        prisma.task.findMany({
          where: { officeId: user.officeId, responsibleId: user.id, dueDate: { lt: todayStart }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
          include: { case: true },
          orderBy: { dueDate: "asc" },
        }),
        prisma.task.findMany({
          where: { officeId: user.officeId, responsibleId: user.id, dueDate: { gte: todayStart, lte: todayEnd }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
          include: { case: true },
          orderBy: [{ dueTime: "asc" }],
        }),
        user.isAdmin
          ? prisma.payable.findMany({ where: { officeId: user.officeId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: todayStart, lte: todayEnd } } })
          : Promise.resolve([]),
        user.isAdmin
          ? prisma.receivable.findMany({ where: { officeId: user.officeId, status: { in: ["PENDENTE", "ATRASADO"] }, dueDate: { gte: todayStart, lte: todayEnd } } })
          : Promise.resolve([]),
      ]);

      // Mesmo título/subtítulo que lib/alerts.ts monta para MENCAO/TAREFA_DELEGADA (getAlerts:
      // linhas ~390 e ~417) — só a fonte mudou, não o conteúdo exibido.
      const notifications: DigestListItem[] = [
        ...mentions.map((m) => ({ title: `${m.comment.author.name} mencionou você`, subtitle: m.comment.content.slice(0, 60), meta: "Menção" })),
        ...delegatedTasks.map((t) => ({ title: `${t.delegatedBy?.name} atribuiu: ${t.title}`, subtitle: t.case?.title, meta: "Tarefa" })),
      ];

      const overdue: DigestListItem[] = overdueTasks.map((t) => taskToDigestItem(t, `${daysLate(t.dueDate, now)} dia(s)`, true));
      const today: DigestListItem[] = todayTasks.map((t) => taskToDigestItem(t, t.dueTime ? `${t.dueTime} · ${typeLabels[t.type] ?? t.type}` : typeLabels[t.type] ?? t.type, false));

      // status filtrado em [PENDENTE, ATRASADO] já exclui A_APURAR sozinho; amount usa
      // valorLiquido para refletir desconto/acréscimo.
      const finance = user.isAdmin
        ? [
            ...payablesToday.map((p) => ({ label: p.description, sub: p.supplier ?? "", amount: valorLiquido(p.amount, p.discount, p.surcharge), kind: "pagar" as const })),
            ...receivablesToday.map((r) => ({ label: r.description, sub: "", amount: valorLiquido(r.amount, r.discount, r.surcharge), kind: "receber" as const })),
          ]
        : null;

      const html = buildDailyDigestHtml({ firstName: user.name.split(" ")[0], dateLabel, notifications, overdue, today, finance });

      await transporter.sendMail({
        from: `"Lúmen" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `Seu resumo do dia — ${now.toLocaleDateString("pt-BR")}`,
        html,
      });
      sent++;
    } catch (e) {
      console.error(`[resumo-diario] falha ao enviar para ${user.email}:`, e);
      failed++;
    }
  }

  return { sent, failed };
}
