import type { NotificationEvent } from "@/lib/comunicadosEventos";

// Assunto/corpo padrão por evento (documento 06) — módulo puro, importado tanto pelo editor
// (lib/actions/emailTemplates.ts, mostra como "padrão" até o escritório salvar o próprio) quanto
// pela drenagem de verdade (lib/notificationOutboxDrain.ts, usa isto quando não há
// EmailTemplate salvo) — as duas leituras têm que bater, senão o que o admin vê no editor
// mentiria sobre o que sai de fato.
export const DEFAULT_TEMPLATES: Record<NotificationEvent, { subject: string; bodyHtml: string }> = {
  PUBLICACAO_NOVA: {
    subject: "Nova publicação — {{processo}}",
    bodyHtml: "<p>Chegou uma publicação nova no processo {{processo}} ({{tribunal}}), do cliente {{cliente}}.</p><p>{{teor}}</p>",
  },
  PRAZO_VENCENDO: {
    subject: "Prazo vencendo — {{processo}}",
    bodyHtml: "<p>O processo {{processo}}, do cliente {{cliente}}, tem prazo vencendo em {{prazo}}.</p>",
  },
  HONORARIO_A_RECEBER: {
    subject: "Honorário a receber — {{cliente}}",
    bodyHtml: "<p>Há um honorário a receber do cliente {{cliente}}, com vencimento em {{prazo}}.</p><p>{{teor}}</p>",
  },
  COBRANCA_ATRASO: {
    subject: "Cobrança em atraso — {{cliente}}",
    bodyHtml: "<p>Uma cobrança do cliente {{cliente}} está em atraso.</p><p>{{teor}}</p>",
  },
  ANDAMENTO_PROCESSUAL: {
    subject: "Novo andamento — {{processo}}",
    bodyHtml: "<p>Novo andamento no processo {{processo}} ({{tribunal}}), do cliente {{cliente}}.</p><p>{{teor}}</p>",
  },
  TAREFA_DELEGADA: {
    subject: "Tarefa delegada a você",
    bodyHtml: "<p>{{responsavel}} delegou a você: {{teor}}</p>\n<p>Processo: {{processo}}</p>",
  },
  CONVITE_EQUIPE: {
    subject: "Convite para a equipe do Lúmen",
    bodyHtml: "<p>{{responsavel}} convidou você para a equipe no Lúmen. Clique no botão abaixo para definir sua senha e acessar.</p>",
  },
  PRAZO_HOJE: {
    subject: "Prazo vence hoje — {{processo}}",
    bodyHtml: "<p>O processo {{processo}}, do cliente {{cliente}}, tem prazo vencendo HOJE.</p><p>{{teor}}</p>",
  },
  AUDIENCIA_24H: {
    subject: "Audiência em menos de 24h — {{processo}}",
    bodyHtml: "<p>O processo {{processo}}, do cliente {{cliente}}, tem audiência marcada para {{prazo}} — menos de 24h.</p><p>{{teor}}</p>",
  },
  HONORARIO_RECEBIDO: {
    subject: "Honorário recebido — {{cliente}}",
    bodyHtml: "<p>Um honorário do cliente {{cliente}} foi recebido.</p><p>{{teor}}</p>",
  },
};
