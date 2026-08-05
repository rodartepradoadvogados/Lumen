// Constantes puras do Passo 2 (Cercar a impersonação), separadas de lib/supportAccess.ts de
// propósito: este arquivo não importa nada de servidor (nada de next/headers, prisma) — pode
// ser importado tanto por Server Components/Actions quanto por Client Components (ex.:
// components/painelMestre/StartActingModal.tsx, que alimenta um <select> com ACCESS_REASONS).
// lib/supportAccess.ts reexporta os dois pra quem já importa de lá continuar funcionando.

// Lista fechada de motivos — nunca campo livre (ver AccessRequest.reasonCode no schema). O
// valor é o rótulo legível mostrado ao escritório na faixa e na página de transparência.
export const ACCESS_REASONS = {
  CONFIG_INTEGRACAO: "Configurar integração (Drive, DJEN, e-mail, WhatsApp)",
  CORRECAO_DADO: "Corrigir dado incorreto",
  DIAGNOSTICO_ERRO: "Diagnosticar erro relatado",
  MIGRACAO: "Migração ou importação de dados",
  INCIDENTE_SEGURANCA: "Incidente de segurança",
  ORDEM_JUDICIAL: "Ordem judicial",
} as const;

export type AccessReasonCode = keyof typeof ACCESS_REASONS;

export const SESSION_MINUTES = 30;

// Rótulo em português de cada AccessAuditLog.action (ver enum implícito no schema:
// ENTRADA | SAIDA | LEITURA | PEDIDO | APROVACAO | NEGACAO | REVOGACAO | SELAGEM). Extraído para
// cá (Fase C) porque tanto a página de transparência (app/(app)/configuracoes/acessos/page.tsx)
// quanto o extrato exportável (app/api/configuracoes/acessos/exportar/route.ts) precisam do
// mesmo texto — duplicar o mapa nos dois lugares só criaria risco de um dia divergir.
export const ACCESS_ACTION_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  LEITURA: "Viu dados reais",
  PEDIDO: "Pedido",
  APROVACAO: "Aprovação",
  NEGACAO: "Negação",
  REVOGACAO: "Revogação",
  SELAGEM: "Selagem",
};
