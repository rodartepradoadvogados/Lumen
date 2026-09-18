-- ASSISTENTE — sessões persistidas e registro de uso.
--
-- Escrito à mão, e não gerado por `prisma db push`, por uma razão de ambiente: o CLI do Prisma
-- abre TCP na 5432, que a política de rede deste ambiente bloqueia. O aplicativo fala com o banco
-- por WebSocket sobre 443 (ver lib/prisma.ts), mas o CLI não usa esse caminho. Este arquivo é o
-- mesmo DDL que o push geraria, aplicado pelo caminho que funciona.
--
-- Idempotente de propósito (IF NOT EXISTS em tudo): pode rodar duas vezes sem estragar nada.

CREATE TABLE IF NOT EXISTS "AssistantSession" (
  "id"        TEXT         NOT NULL,
  "officeId"  TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "titulo"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantMessage" (
  "id"        TEXT         NOT NULL,
  "sessionId" TEXT         NOT NULL,
  "papel"     TEXT         NOT NULL,
  "conteudo"  TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantAuditLog" (
  "id"         TEXT         NOT NULL,
  "officeId"   TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "sessionId"  TEXT,
  "acao"       TEXT         NOT NULL,
  "ferramenta" TEXT,
  "detalhe"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssistantSession_userId_updatedAt_idx"   ON "AssistantSession"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AssistantSession_officeId_updatedAt_idx" ON "AssistantSession"("officeId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AssistantMessage_sessionId_createdAt_idx" ON "AssistantMessage"("sessionId", "createdAt");
-- Este é o índice que sustenta o limite de uso: contar as linhas do último minuto de um
-- escritório é uma varredura de faixa sobre ele, não uma varredura de tabela.
CREATE INDEX IF NOT EXISTS "AssistantAuditLog_officeId_createdAt_idx" ON "AssistantAuditLog"("officeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantAuditLog_userId_createdAt_idx"   ON "AssistantAuditLog"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AssistantSession" ADD CONSTRAINT "AssistantSession_officeId_fkey"
    FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssistantSession" ADD CONSTRAINT "AssistantSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ON DELETE CASCADE aqui, e só aqui: apagar uma conversa deve levar as mensagens dela junto.
-- Nas outras duas a exclusão é RESTRICT — apagar um escritório ou um usuário não pode arrastar
-- silenciosamente o registro de uso, que é justamente a prova de o que foi consultado.
DO $$ BEGIN
  ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AssistantSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssistantAuditLog" ADD CONSTRAINT "AssistantAuditLog_officeId_fkey"
    FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AssistantAuditLog" ADD CONSTRAINT "AssistantAuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
