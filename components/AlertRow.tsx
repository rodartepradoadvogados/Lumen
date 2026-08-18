"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
            // alert.amount já vem como SALDO EM ABERTO (Fase 3 — ver lib/alerts.ts), não o valor
            // cheio: passar liquido=saldo e alreadyPaid=0 aqui reproduz exatamente esse saldo como
            // valor sugerido, sem precisar buscar de novo o histórico de pagamentos só para este
            // atalho. bankAccounts vazio: quem precisar de uma conta cadastra na hora (quick-add).
            liquido={alert.amount ?? 0}
            alreadyPaid={0}
            bankAccounts={[]}
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
            // Marca a delegação como vista assim que o destinatário abre o compromisso — não
            // bloqueia a abertura do modal esperando a resposta, mas o refresh no final (mesmo
            // padrão de DismissibleAlertRow.tsx) tira o alerta da tela sem depender de a Server
            // Action conhecer todas as rotas onde este componente está montado — antes disso, a
            // revalidatePath da action cobria só as rotas do site, e o alerta continuava visível
            // no app até um reload duro (achado A22 da revisão gauntlet).
            if (alert.kind === "TAREFA_DELEGADA") {
              acknowledgeDelegation(entityId).then(() => router.refresh());
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
