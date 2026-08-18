"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { approveDeletion, rejectDeletion } from "@/lib/actions/deletion";

type Req = {
  id: string;
  entityType: string;
  entityLabel: string;
  scope?: string | null;
  alsoDeleteLinked?: boolean;
  createdAt: string;
  requestedBy: { name: string };
};

const entityLabels: Record<string, string> = {
  TASK: "Tarefa/Evento",
  CASE: "Processo/Caso",
  ATTENDANCE: "Atendimento",
  PAYABLE: "Conta a Pagar",
  RECEIVABLE: "Conta a Receber",
  HONORARIO_LANCAMENTO: "Honorário parcelado",
};

// Só preenchido para RECEIVABLE/PAYABLE agrupados (ver DeletionScope em lib/actions/deletion.ts)
// — mostra pro admin, antes de aprovar, que a exclusão pode ser bem mais drástica que "só este
// lançamento".
const scopeLabels: Record<string, string> = {
  FOLLOWING: "este lançamento e os seguintes",
  ALL: "TODOS os lançamentos deste agrupamento",
};

export default function DeletionRequestsPanel({ requests }: { requests: Req[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handle(id: string, action: "approve" | "reject") {
    startTransition(async () => {
      if (action === "approve") {
        const result = await approveDeletion(id);
        // Sem isto, uma exclusão bloqueada (ex.: processo com honorário/protocolo vinculado)
        // ficava com falso ar de sucesso — a Server Action já não marca mais "APROVADA" nesse
        // caso, mas a tela precisa avisar o admin, e não só silenciar.
        if (result.error) {
          window.alert(result.error);
          return;
        }
      } else {
        await rejectDeletion(id);
      }
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-regua">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-tx-3 uppercase tracking-wide">{entityLabels[r.entityType] ?? r.entityType}</p>
            <p className="text-sm font-medium text-tx mt-0.5 truncate">{r.entityLabel}</p>
            {r.scope && scopeLabels[r.scope] && (
              <p className="text-xs font-semibold text-atencao mt-0.5">Escopo: {scopeLabels[r.scope]}</p>
            )}
            {r.alsoDeleteLinked && (
              <p className="text-xs font-semibold text-atencao mt-0.5">Vai excluir também o reembolso/despesa vinculada</p>
            )}
            <p className="text-xs text-tx-2 mt-0.5">Solicitado por {r.requestedBy.name}</p>
          </div>
          <button
            onClick={() => handle(r.id, "approve")}
            disabled={pending}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Check size={12} /> Aprovar
          </button>
          <button
            onClick={() => handle(r.id, "reject")}
            disabled={pending}
            className="flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:text-red-900 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50"
          >
            <X size={12} /> Recusar
          </button>
        </div>
      ))}
    </div>
  );
}
