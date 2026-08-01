"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { requestDeletion, requestDeletionScoped, type DeletionScope } from "@/lib/actions/deletion";

type EntityType = "TASK" | "CASE" | "ATTENDANCE" | "PAYABLE" | "RECEIVABLE" | "HONORARIO_LANCAMENTO";

// Só relevante para entityType RECEIVABLE/PAYABLE — de qual dos três agrupamentos existentes esta
// linha faz parte (ver DeletionScope/performDeleteScoped em lib/actions/deletion.ts), calculado
// pelo componente-pai a partir dos dados que ele já tem em mãos (groupId/honorarioLancamentoId/
// recurringFeeId), nunca com uma query extra aqui. Ausente (ou undefined) = lançamento avulso,
// mantém o botão único de sempre (comportamento inalterado).
export type FinanceGroupKind = "PARCELAMENTO" | "HONORARIO" | "RECORRENTE";

const FOLLOWING_CONFIRM = "Tem certeza que deseja excluir esse evento e todos os outros seguintes?";
const ALL_CONFIRM = "Tem certeza que deseja excluir todos os lançamentos? Essa ação impactará em todo o financeiro relativo a essa conta.";

export default function DeleteEntityButton({
  entityType,
  entityId,
  entityLabel,
  confirmMessage,
  groupKind,
  onDone,
}: {
  entityType: EntityType;
  entityId: string;
  entityLabel: string;
  confirmMessage: string;
  groupKind?: FinanceGroupKind;
  onDone?: (result: { error?: string; pending?: boolean }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const [choosing, setChoosing] = useState(false);

  function runDeletion(scope: DeletionScope) {
    setMsg(null);
    startTransition(async () => {
      const result =
        scope === "ONLY" && !groupKind
          ? await requestDeletion(entityType, entityId, entityLabel)
          : await requestDeletionScoped(entityType as "PAYABLE" | "RECEIVABLE", entityId, entityLabel, scope);
      if (result.error) {
        setMsg({ type: "error", text: result.error });
      } else if (result.pending) {
        setMsg({ type: "info", text: "Solicitação de exclusão enviada. Aguardando aprovação de um administrador." });
      }
      onDone?.(result);
      router.refresh();
    });
  }

  // Sem agrupamento (ou entidade que não é RECEIVABLE/PAYABLE): comportamento de sempre, um único
  // pop-up de confirmação — nada muda aqui.
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

  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => (groupKind ? setChoosing(true) : handleClickSimple())}
        disabled={pending}
        data-tip="Excluir"
        className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-500/10 dark:hover:bg-bordo-400/10 transition-colors disabled:opacity-40"
      >
        <Trash2 size={14} />
      </button>
      {msg && (
        <span
          className={`absolute right-0 top-full mt-1 z-10 w-64 text-[11px] rounded-lg px-2.5 py-1.5 shadow-pop border ${
            msg.type === "error"
              ? "bg-bordo-100 dark:bg-bordo-900/40 text-bordo-700 dark:text-bordo-400 border-bordo-100 dark:border-bordo-400/20"
              : "bg-blue-50 dark:bg-blue-400/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-400/20"
          }`}
        >
          {msg.text}
        </span>
      )}
      {choosing && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">O que deseja excluir?</h3>
              <button
                onClick={() => setChoosing(false)}
                className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mb-2">
                Este lançamento faz parte de um agrupamento{" "}
                {groupKind === "HONORARIO" ? "(honorário parcelado)" : groupKind === "RECORRENTE" ? "(honorário recorrente)" : "(parcelamento)"}.
                Cada opção abaixo tem uma consequência diferente.
              </p>
              <button
                onClick={() => handleChoose("ONLY")}
                disabled={pending}
                className="w-full text-left text-sm font-medium text-navy-900 dark:text-cream-50 bg-cream-100 dark:bg-white/5 hover:bg-cream-200 dark:hover:bg-white/10 rounded-lg px-3.5 py-2.5 disabled:opacity-50"
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
                className="w-full text-left text-sm font-medium text-bordo-700 dark:text-bordo-400 bg-bordo-500/10 hover:bg-bordo-500/20 rounded-lg px-3.5 py-2.5 disabled:opacity-50"
              >
                Excluir todos os lançamentos
              </button>
              <button
                onClick={() => setChoosing(false)}
                className="w-full text-center text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 pt-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
