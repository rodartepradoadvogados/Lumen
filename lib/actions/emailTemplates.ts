"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { revalidatePath } from "next/cache";
import { ALL_EVENTOS, ALL_EVENTOS_KEYS, isNotificationEvent, type NotificationEvent } from "@/lib/comunicadosEventos";
import { buildDigestEmailHtml, SAMPLE_VARS } from "@/lib/emailTemplateRender";
import { DEFAULT_TEMPLATES } from "@/lib/comunicadosTemplatesPadrao";
import { sendSimpleEmail } from "@/lib/email";

// Documento 06 (Fase 3 — Comunicados), "editor de template com prévia" — a coluna do lado das
// regras pessoais (lib/actions/comunicados.ts). Diferente daquela: aqui o template é UM por
// (escritório, evento) — quem edita afeta o e-mail que TODO MUNDO do escritório recebe pro
// mesmo evento — por isso gate de sócio (mesmo padrão de togglePinNotice em
// lib/actions/notices.ts), não "qualquer pessoa configura o próprio". Cobre os 10 eventos de
// ALL_EVENTOS (os 7 "por evento" da tela de regras + os 3 que só existem como exceção —
// PRAZO_HOJE/AUDIENCIA_24H/HONORARIO_RECEBIDO — porque esses também mandam e-mail de verdade
// quando o canal configurado é EMAIL, e merecem o mesmo texto editável).

export type EmailTemplateItem = {
  event: NotificationEvent;
  label: string;
  subject: string;
  bodyHtml: string;
  salvo: boolean;
};

export async function listEmailTemplates(): Promise<EmailTemplateItem[] | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem editar os templates de e-mail." };

  const salvos = await prisma.emailTemplate.findMany({ where: { officeId: user.officeId } });
  const porEvento = new Map(salvos.map((t) => [t.event, t]));

  return ALL_EVENTOS_KEYS.map((event) => {
    const salvo = porEvento.get(event);
    const padrao = DEFAULT_TEMPLATES[event];
    return {
      event,
      label: ALL_EVENTOS[event],
      subject: salvo?.subject ?? padrao.subject,
      bodyHtml: salvo?.bodyHtml ?? padrao.bodyHtml,
      salvo: Boolean(salvo),
    };
  });
}

export async function salvarEmailTemplate(event: NotificationEvent, input: { subject: string; bodyHtml: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem editar os templates de e-mail." };
  if (!isNotificationEvent(event)) return { error: "Evento inválido." };
  if (!input.subject.trim()) return { error: "Assunto não pode ficar em branco." };
  if (!input.bodyHtml.trim()) return { error: "Corpo não pode ficar em branco." };

  await prisma.emailTemplate.upsert({
    where: { officeId_event: { officeId: user.officeId, event } },
    create: { officeId: user.officeId, event, subject: input.subject, bodyHtml: input.bodyHtml },
    update: { subject: input.subject, bodyHtml: input.bodyHtml },
  });
  revalidatePath("/configuracoes/comunicados");
  return {};
}

// Manda o e-mail de teste pro próprio sócio que clicou (nunca pra um destinatário de verdade —
// o editor é tela de configuração). sendSimpleEmail em vez do provedor pessoal
// (EmailSendProviderPicker.tsx / lib/gmailSend.ts): sendEmailReply só monta texto puro
// (Content-Type: text/plain), incompatível com o HTML da prévia — divergência assumida, ver
// comentário no topo de lib/emailTemplateRender.ts.
export async function enviarTesteEmailTemplate(event: NotificationEvent, input: { subject: string; bodyHtml: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem editar os templates de e-mail." };
  if (!isNotificationEvent(event)) return { error: "Evento inválido." };
  if (!user.email) return { error: "Sua conta não tem e-mail cadastrado." };

  const html = buildDigestEmailHtml({ subject: input.subject, bodyHtml: input.bodyHtml, url: SAMPLE_VARS.link, vars: SAMPLE_VARS });
  const result = await sendSimpleEmail(user.email, `[Teste] ${input.subject}`, html);
  if (!result.sent) return { error: "Não foi possível enviar — confira a configuração de e-mail do escritório." };
  return {};
}
