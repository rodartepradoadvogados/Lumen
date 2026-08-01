-- Protocolos no Processo — Fase 3/4 (sugestão de documentos, aviso de já protocolado, checagem
-- de procuração, download em zip e vínculo de tarefa/prazo)
--
-- Só uma coluna nova: ProtocoloLote.taskId, referência solta (sem FK formal) para Task — ver
-- comentário do campo em prisma/schema.prisma e lib/actions/protocolos.ts (criarTarefaDoLote/
-- vincularTaskAoLote/getVinculoTarefa). Os outros itens da Fase 3/4 são só lógica nova em cima das
-- tabelas que já existiam (Fase 1: 2026-07-31-protocolos.sql) — nada mais muda no banco.
--
-- Seguro: puramente aditivo (ALTER TABLE ADD COLUMN nullable). Não altera nenhuma linha existente.
-- Roda inteiro numa transação — se falhar, nada é aplicado.

BEGIN;

ALTER TABLE "ProtocoloLote" ADD COLUMN IF NOT EXISTS "taskId" TEXT;

COMMIT;
