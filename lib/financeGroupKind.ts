import type { FinanceGroupKind } from "@/components/DeleteEntityButton";

// Mesma prioridade usada em lib/actions/deletion.ts:performDeleteScoped — honorarioLancamentoId
// antes de groupId porque um honorário parcelado grava os dois campos ao mesmo tempo (ver
// createHonorarioLancamento, lib/actions/honorarioLancamento.ts); o agrupamento que importa pro
// usuário ali é o honorário, não o parcelamento genérico por trás dele.
export function financeGroupKind(entity: {
  groupId?: string | null;
  honorarioLancamentoId?: string | null;
  recurringFeeId?: string | null;
}): FinanceGroupKind | undefined {
  if (entity.honorarioLancamentoId) return "HONORARIO";
  if (entity.recurringFeeId) return "RECORRENTE";
  if (entity.groupId) return "PARCELAMENTO";
  return undefined;
}
