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

export async function buildDailyAgendaHtml() {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: { dueDate: { gte: startOfDay(now), lte: endOfDay(now) }, status: { not: "CANCELADO" } },
    include: { case: true, responsible: true },
    orderBy: [{ dueTime: "asc" }],
  });

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

  return `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">RODARTE PRADO ADVOGADOS</h1>
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
    </div>
  </div>`;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }

  const html = `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;">
    <div style="background:#0b1730;padding:24px;text-align:center;">
      <h1 style="color:#fff;font-size:20px;margin:0;">RODARTE PRADO ADVOGADOS</h1>
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
      from: `"Rodarte Prado Advogados" <${process.env.EMAIL_USER}>`,
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

export async function sendDailyAgendaEmail(): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP não configurado (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD ausentes)." };
  }
  const to = process.env.EMAIL_TO || "jairo@rodarteprado.com.br,rodrigo@rodarteprado.com.br";
  const html = await buildDailyAgendaHtml();

  try {
    await transporter.sendMail({
      from: `"Rodarte Prado Advogados" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Agenda do dia — ${new Date().toLocaleDateString("pt-BR")}`,
      html,
    });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido ao enviar";
    return { sent: false, reason: message };
  }
}
