"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import SettleModal from "@/components/SettleModal";
import TaskDetailModal from "@/components/TaskDetailModal";
import { acknowledgeDelegation } from "@/lib/actions/tasks";
import type { AlertItem } from "@/lib/alerts";

// Roteamento por tipo ao clicar num alerta, compartilhado entre a Central de Alertas
// do Painel e a página completa /alertas:
// - conta a pagar/receber (vencida ou sem vencimento) -> card de baixa/recebimento
// - prazo vencido (tarefa/evento/audiência/perícia) -> card do compromisso
// - menção / follow-up -> navega direto (href já aponta para o lugar certo)
export default function AlertRow({
  alert,
  className,
  children,
}: {
  alert: AlertItem;
  className?: string;
  children: ReactNode;
}) {
  const [modal, setModal] = useState<"settle" | "task" | null>(null);

  if ((alert.entityKind === "PAYABLE" || alert.entityKind === "RECEIVABLE") && alert.entityId) {
    return (
      <>
        <button type="button" onClick={() => setModal("settle")} className={className}>
          {children}
        </button>
        {modal === "settle" && (
          <SettleModal
            id={alert.entityId}
            kind={alert.entityKind === "PAYABLE" ? "payable" : "receivable"}
            amount={alert.amount ?? 0}
            onClose={() => setModal(null)}
          />
        )}
      </>
    );
  }

  if (alert.entityKind === "TASK" && alert.entityId) {
    const entityId = alert.entityId;
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setModal("task");
            // Marca a delegação como vista assim que o destinatário abre o compromisso —
            // "fire and forget", não precisa bloquear a abertura do modal esperando a resposta.
            if (alert.kind === "TAREFA_DELEGADA") {
              void acknowledgeDelegation(entityId);
            }
          }}
          className={className}
        >
          {children}
        </button>
        {modal === "task" && <TaskDetailModal taskId={entityId} onClose={() => setModal(null)} />}
      </>
    );
  }

  return (
    <Link href={alert.href} className={className}>
      {children}
    </Link>
  );
}
