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
