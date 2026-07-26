import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

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
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#0f1f3d;">${t.title}${t.case ? `<br/><span style="color:#888;font-size:12px;">${t.case.title}</span>` : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${t.responsible?.name ?? "—"}</td>
      </tr>`
    )
    .join("");

  const pubKindLabels: Record<string, string> = { PUBLICACAO: "Publicação", ANDAMENTO: "Andamento" };
  const pubRows = publications
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;"><span style="background:#f3efe6;color:#8a6a1f;padding:2px 8px;border-radius:10px;font-weight:600;">${pubKindLabels[p.kind] ?? p.kind}</span> <span style="color:#999;font-size:11px;">${p.source}</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#0f1f3d;">${p.content.slice(0, 220)}${p.content.length > 220 ? "…" : ""}${p.case ? `<br/><span style="color:#888;font-size:12px;">${p.case.title}</span>` : ""}</td>
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

export async function sendPasswordResetEmail(to: string, resetUrl: string, officeName: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

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

  try {
    await transporter.sendMail({
      from: `"${officeName}" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Redefinição de senha — Sistema Interno",
      html,
    });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido ao enviar";
    return { sent: false, reason: message };
  }
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
