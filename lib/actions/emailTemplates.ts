"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { revalidatePath } from "next/cache";
import { PER_EVENT_EVENTOS, type PerEventEvento } from "@/lib/comunicadosEventos";
import { buildDigestEmailHtml, SAMPLE_VARS } from "@/lib/emailTemplateRender";
import { sendSimpleEmail } from "@/lib/email";

// Documento 06 (Fase 3 — Comunicados), "editor de template com prévia" — a coluna do lado das
// regras pessoais (lib/actions/comunicados.ts). Diferente daquela: aqui o template é UM por
// (escritório, evento) — quem edita afeta o e-mail que TODO MUNDO do escritório recebe pro
// mesmo evento — por isso gate de sócio (mesmo padrão de togglePinNotice em
// lib/actions/notices.ts), não "qualquer pessoa configura o próprio".

export type EmailTemplateItem = {
  event: PerEventEvento;
  label: string;
  subject: string;
  bodyHtml: string;
  salvo: boolean;
};

// Assunto/corpo padrão por evento — usados quando o escritório ainda não salvou um template
// próprio (a linha em EmailTemplate só existe a partir do primeiro "Salvar"). Corpo em HTML cru
// (o que a pessoa edita na aba "Corpo"), variáveis entre chaves duplas — ver lib/emailTemplateRender.ts.
const DEFAULT_TEMPLATES: Record<PerEventEvento, { subject: string; bodyHtml: string }> = {
  PUBLICACAO_NOVA: {
    subject: "Nova publicação — {{processo}}",
    bodyHtml: "<p>Chegou uma publicação nova no processo {{processo}} ({{tribunal}}), do cliente {{cliente}}.</p><p>{{teor}}</p>",
  },
  PRAZO_VENCENDO: {
    subject: "Prazo vencendo — {{processo}}",
    bodyHtml: "<p>O processo {{processo}}, do cliente {{cliente}}, tem prazo vencendo.</p>",
  },
  HONORARIO_A_RECEBER: {
    subject: "Honorário a receber — {{cliente}}",
    bodyHtml: "<p>Há um honorário a receber do cliente {{cliente}}.</p>",
  },
  COBRANCA_ATRASO: {
    subject: "Cobrança em atraso — {{cliente}}",
    bodyHtml: "<p>Uma cobrança do cliente {{cliente}} está em atraso.</p>",
  },
  ANDAMENTO_PROCESSUAL: {
    subject: "Novo andamento — {{processo}}",
    bodyHtml: "<p>Novo andamento no processo {{processo}} ({{tribunal}}), do cliente {{cliente}}.</p><p>{{teor}}</p>",
  },
  TAREFA_DELEGADA: {
    subject: "Tarefa delegada a você",
    bodyHtml: "<p>{{responsavel}} delegou uma tarefa a você{{#processo}} no processo {{processo}}{{/processo}}.</p>",
  },
  CONVITE_EQUIPE: {
    subject: "Convite para a equipe do Lúmen",
    bodyHtml: "<p>{{responsavel}} convidou você para a equipe no Lúmen.</p>",
  },
};

export async function listEmailTemplates(): Promise<EmailTemplateItem[] | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem editar os templates de e-mail." };

  const salvos = await prisma.emailTemplate.findMany({ where: { officeId: user.officeId } });
  const porEvento = new Map(salvos.map((t) => [t.event, t]));

  return (Object.keys(PER_EVENT_EVENTOS) as PerEventEvento[]).map((event) => {
    const salvo = porEvento.get(event);
    const padrao = DEFAULT_TEMPLATES[event];
    return {
      event,
      label: PER_EVENT_EVENTOS[event],
      subject: salvo?.subject ?? padrao.subject,
      bodyHtml: salvo?.bodyHtml ?? padrao.bodyHtml,
      salvo: Boolean(salvo),
    };
  });
}

export async function salvarEmailTemplate(event: PerEventEvento, input: { subject: string; bodyHtml: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem editar os templates de e-mail." };
  if (!(event in PER_EVENT_EVENTOS)) return { error: "Evento inválido." };
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
export async function enviarTesteEmailTemplate(event: PerEventEvento, input: { subject: string; bodyHtml: string }): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!user.isAdmin) return { error: "Apenas sócios podem editar os templates de e-mail." };
  if (!(event in PER_EVENT_EVENTOS)) return { error: "Evento inválido." };
  if (!user.email) return { error: "Sua conta não tem e-mail cadastrado." };

  const html = buildDigestEmailHtml({ subject: input.subject, bodyHtml: input.bodyHtml, url: SAMPLE_VARS.link, vars: SAMPLE_VARS });
  const result = await sendSimpleEmail(user.email, `[Teste] ${input.subject}`, html);
  if (!result.sent) return { error: "Não foi possível enviar — confira a configuração de e-mail do escritório." };
  return {};
}
