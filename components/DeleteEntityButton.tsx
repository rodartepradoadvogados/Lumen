"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { requestDeletion, requestDeletionScoped, type DeletionScope } from "@/lib/actions/deletion";
import { formatCurrency } from "@/components/ui";

type EntityType = "TASK" | "CASE" | "ATTENDANCE" | "PAYABLE" | "RECEIVABLE" | "HONORARIO_LANCAMENTO";

// Só relevante para entityType RECEIVABLE/PAYABLE — de qual dos três agrupamentos existentes esta
// linha faz parte (ver DeletionScope/performDeleteScoped em lib/actions/deletion.ts), calculado
// pelo componente-pai a partir dos dados que ele já tem em mãos (groupId/honorarioLancamentoId/
// recurringFeeId), nunca com uma query extra aqui. Ausente (ou undefined) = lançamento avulso,
// mantém o botão único de sempre (comportamento inalterado).
export type FinanceGroupKind = "PARCELAMENTO" | "HONORARIO" | "RECORRENTE";

// Só relevante para entityType RECEIVABLE/PAYABLE com um reembolso vinculado (ver
// Payable.reimbursementReceivable/Receivable.reimbursesPayableId) — calculado pelo componente-pai
// a partir dos dados que ele já tem em mãos, mesma convenção de FinanceGroupKind acima.
// "payableHasReimbursement": esta linha é a DESPESA, amount/status são do Receivable de reembolso.
// "receivableReimbursesPayable": esta linha é o próprio REEMBOLSO, description é da Payable de
// origem. Presente = a UI troca o window.confirm simples por um pop-up dedicado com o aviso e o
// checkbox opcional "Excluir também o vinculado" — e, de propósito, IGNORA groupKind quando os
// dois vierem preenchidos ao mesmo tempo (a escolha de escopo FOLLOWING/ALL sai da jogada; só
// "excluir este lançamento" continua disponível): o reembolso é sempre um vínculo 1:1 com ESTE
// registro específico, nunca com o agrupamento inteiro, então misturar as duas escolhas num único
// pop-up só confundiria sem ganhar nada — combinação rara na prática e fora do pedido original.
export type LinkedReimbursement =
  | { direction: "payableHasReimbursement"; amount: number; status: string }
  | { direction: "receivableReimbursesPayable"; description: string };

const FOLLOWING_CONFIRM = "Tem certeza que deseja excluir esse evento e todos os outros seguintes?";
const ALL_CONFIRM =
  "Tem certeza que deseja excluir todos os lançamentos dessa série, incluindo os já pagos/recebidos? Essa ação impactará em todo o financeiro relativo a essa conta (Livro Caixa, DRE e outros) e não pode ser desfeita.";

export default function DeleteEntityButton({
  entityType,
  entityId,
  entityLabel,
  confirmMessage,
  groupKind,
  linkedReimbursement,
  onDone,
}: {
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  confirmMessage: string;
  groupKind?: FinanceGroupKind;
  linkedReimbursement?: LinkedReimbursement | null;
  onDone?: (result: { error?: string; pending?: boolean; warning?: string }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [confirmingLinked, setConfirmingLinked] = useState(false);
  const [alsoDeleteLinked, setAlsoDeleteLinked] = useState(false);

  function runDeletion(scope: DeletionScope, deleteLinked?: boolean) {
    setMsg(null);
    startTransition(async () => {
      const result =
        scope === "ONLY" && !groupKind
          ? await requestDeletion(entityType, entityId, entityLabel, deleteLinked)
          : await requestDeletionScoped(entityType as "PAYABLE" | "RECEIVABLE", entityId, entityLabel, scope, deleteLinked);
      if (result.error) {
        setMsg({ type: "error", text: result.error });
      } else if (result.pending) {
        setMsg({ type: "info", text: "Solicitação de exclusão enviada. Aguardando aprovação de um administrador." });
      } else if (result.warning) {
        setMsg({ type: "info", text: result.warning });
      }
      onDone?.(result);
      router.refresh();
    });
  }

  // Sem agrupamento nem reembolso vinculado (ou entidade que não é RECEIVABLE/PAYABLE):
  // comportamento de sempre, um único pop-up de confirmação — nada muda aqui.
  function handleClickSimple() {
    if (!window.confirm(confirmMessage)) return;
    runDeletion("ONLY");
  }

  function handleChoose(scope: DeletionScope) {
    const text = scope === "ONLY" ? confirmMessage : scope === "FOLLOWING" ? FOLLOWING_CONFIRM : ALL_CONFIRM;
    if (!window.confirm(text)) return;
    setChoosing(false);
    runDeletion(scope);
  }

  function handleConfirmLinked() {
    setConfirmingLinked(false);
    runDeletion("ONLY", alsoDeleteLinked);
  }

  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          if (linkedReimbursement) {
            setAlsoDeleteLinked(false);
            setConfirmingLinked(true);
          } else if (groupKind) {
            setChoosing(true);
          } else {
            handleClickSimple();
          }
        }}
        disabled={pending}
        data-tip="Excluir"
        className="p-1.5 rounded-lg text-tx-3 hover:text-atencao hover:bg-atencao/10 transition-colors disabled:opacity-40"
      >
        <Trash2 size={14} />
      </button>
      {msg && (
        <span
          className={`absolute right-0 top-full mt-1 z-10 w-64 text-[11px] rounded-lg px-2.5 py-1.5 shadow-pop border ${
            msg.type === "error"
              ? "bg-urgente-bg text-urgente border-urgente/20"
              : "bg-blue-50 dark:bg-blue-400/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-400/20"
          }`}
        >
          {msg.text}
        </span>
      )}
      {choosing && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf rounded-xl shadow-pop w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-serif font-bold text-tx text-sm">O que deseja excluir?</h3>
              <button
                onClick={() => setChoosing(false)}
                className="text-tx-3 hover:text-tx"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-tx-2 mb-2">
                Este lançamento faz parte de um agrupamento{" "}
                {groupKind === "HONORARIO" ? "(honorário parcelado)" : groupKind === "RECORRENTE" ? "(honorário recorrente)" : "(parcelamento)"}.
                Cada opção abaixo tem uma consequência diferente.
              </p>
              <button
                onClick={() => handleChoose("ONLY")}
                disabled={pending}
                className="w-full text-left text-sm font-medium text-tx bg-sf-apoio hover:bg-regua rounded-lg px-3.5 py-2.5 disabled:opacity-50"
              >
                Excluir apenas este lançamento
              </button>
              <button
                onClick={() => handleChoose("FOLLOWING")}
                disabled={pending}
                className="w-full text-left text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg px-3.5 py-2.5 disabled:opacity-50"
              >
                Excluir este lançamento e os seguintes
              </button>
              <button
                onClick={() => handleChoose("ALL")}
                disabled={pending}
                className="w-full text-left text-sm font-medium text-atencao bg-atencao/10 hover:bg-atencao/20 rounded-lg px-3.5 py-2.5 disabled:opacity-50"
              >
                Excluir todos os lançamentos
              </button>
              <button
                onClick={() => setChoosing(false)}
                className="w-full text-center text-xs font-semibold text-tx-2 hover:text-tx pt-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmingLinked && linkedReimbursement && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf rounded-xl shadow-pop w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-serif font-bold text-tx text-sm">Excluir lançamento</h3>
              <button
                onClick={() => setConfirmingLinked(false)}
                className="text-tx-3 hover:text-tx"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-tx-2">{confirmMessage}</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                {linkedReimbursement.direction === "payableHasReimbursement" ? (
                  <>
                    Esta despesa tem um reembolso vinculado ({formatCurrency(linkedReimbursement.amount)}, {linkedReimbursement.status}). Excluir aqui
                    não apaga o reembolso — ele ficará sem vínculo, a menos que você marque a opção abaixo.
                  </>
                ) : (
                  <>
                    Esta receita é o reembolso da despesa &quot;{linkedReimbursement.description}&quot;. Excluir aqui não apaga a despesa — ela ficará
                    sem vínculo, a menos que você marque a opção abaixo.
                  </>
                )}
              </p>
              <label className="flex items-start gap-2 text-xs text-tx-2">
                <input
                  type="checkbox"
                  checked={alsoDeleteLinked}
                  onChange={(e) => setAlsoDeleteLinked(e.target.checked)}
                  className="mt-0.5"
                />
                Excluir também {linkedReimbursement.direction === "payableHasReimbursement" ? "o reembolso vinculado" : "a despesa vinculada"}
              </label>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setConfirmingLinked(false)}
                  className="text-xs font-semibold text-tx-2 hover:text-tx px-3 py-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmLinked}
                  disabled={pending}
                  className="text-xs font-semibold text-white bg-atencao hover:opacity-90 rounded-lg px-3.5 py-2 disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
