-- Protocolos no Processo — Fase 1 (fundação)
--
-- Cria as duas tabelas do histórico de protocolos: ProtocoloLote (o protocolo em si) e
-- ProtocoloLoteItem (a lista ordenada de documentos que o compõem). Um protocolo NUNCA guarda
-- arquivo: ProtocoloLoteItem só aponta para um Attachment que já existe — é isso que impede
-- duplicar documento. Ver lib/protocolos.ts e prisma/schema.prisma.
--
-- Seguro: puramente aditivo. Não altera nenhuma tabela existente, não move nem apaga dado nenhum.
-- Roda inteiro numa transação — se qualquer linha falhar, nada é aplicado.
-- Gerado por: prisma migrate diff (não editar à mão).

BEGIN;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProtocoloLote" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_PREPARO',
    "observacao" TEXT,
    "numeroProtocolo" TEXT,
    "protocoladoEm" TIMESTAMP(3),
    "protocoladoPorId" TEXT,
    "driveFolderId" TEXT,
    "comprovanteId" TEXT,
    "caseId" TEXT NOT NULL,
    "criadoPorId" TEXT,
    "officeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtocoloLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProtocoloLoteItem" (
    "id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "loteId" TEXT NOT NULL,
    "attachmentId" TEXT,
    "nomeSnapshot" TEXT NOT NULL,
    "docTypeSnapshot" TEXT NOT NULL,
    "driveShortcutId" TEXT,

    CONSTRAINT "ProtocoloLoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProtocoloLote_officeId_idx" ON "ProtocoloLote"("officeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProtocoloLote_caseId_idx" ON "ProtocoloLote"("caseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProtocoloLoteItem_loteId_idx" ON "ProtocoloLoteItem"("loteId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProtocoloLoteItem_loteId_attachmentId_key" ON "ProtocoloLoteItem"("loteId", "attachmentId");

-- AddForeignKey
ALTER TABLE "ProtocoloLote" ADD CONSTRAINT "ProtocoloLote_protocoladoPorId_fkey" FOREIGN KEY ("protocoladoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocoloLote" ADD CONSTRAINT "ProtocoloLote_comprovanteId_fkey" FOREIGN KEY ("comprovanteId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocoloLote" ADD CONSTRAINT "ProtocoloLote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocoloLote" ADD CONSTRAINT "ProtocoloLote_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocoloLote" ADD CONSTRAINT "ProtocoloLote_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocoloLoteItem" ADD CONSTRAINT "ProtocoloLoteItem_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "ProtocoloLote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocoloLoteItem" ADD CONSTRAINT "ProtocoloLoteItem_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
