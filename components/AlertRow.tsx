"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SettleModal from "@/components/SettleModal";
import TaskDetailModal from "@/components/TaskDetailModal";
import { acknowledgeDelegation } from "@/lib/actions/tasks";
import { getSettleContext } from "@/lib/actions/financeiro";
import type { AlertItem } from "@/lib/alerts";

// Roteamento por tipo ao clicar num alerta, compartilhado entre a Central de Alertas
// do Painel e a página completa /alertas:
// - conta a pagar/receber (vencida ou sem vencimento) -> card de baixa/recebimento
// - prazo vencido (tarefa/evento/audiência/perícia) -> card do compromisso
// - menção / follow-up -> navega direto (href já aponta para o lugar certo)
// - alerta com `abrirEmNovaAba` (os dois de geração de minuta) -> ABA NOVA do navegador
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
  const [settleCtx, setSettleCtx] = useState<Awaited<ReturnType<typeof getSettleContext>> | null>(null);
  const [settleErro, setSettleErro] = useState("");

  if ((alert.entityKind === "PAYABLE" || alert.entityKind === "RECEIVABLE") && alert.entityId) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            const entityId = alert.entityId!;
            const kind = alert.entityKind === "PAYABLE" ? "payable" : "receivable";
            setSettleCtx(null);
            setSettleErro("");
            setModal("settle");
            getSettleContext(kind, entityId).then(setSettleCtx).catch((e) => setSettleErro(e instanceof Error ? e.message : "Não foi possível abrir a baixa."));
          }}
          className={className}
        >
          {children}
        </button>
        {modal === "settle" && settleErro && (
          <div role="alert" className="fixed bottom-5 right-5 z-[200] w-72 bg-grafite-800 text-white px-4 py-3 text-sm" onClick={() => setModal(null)}>
            {settleErro}
          </div>
        )}
        {modal === "settle" && settleCtx && (
          <SettleModal
            id={alert.entityId}
            kind={alert.entityKind === "PAYABLE" ? "payable" : "receivable"}
            // Valores reais do servidor (saldo em aberto + contas ativas), não o que o alerta traz.
            liquido={settleCtx.liquido}
            alreadyPaid={settleCtx.alreadyPaid}
            bankAccounts={settleCtx.bankAccounts}
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

  // ABA NOVA DE VERDADE, e não `<Link>`: o Peticionamento é uma aba separada do navegador por
  // PRIORIDADE 0 do dono, e há suíte guardando isso (lib/testes/peticionamentoAbaNova.teste.ts).
  //
  // `<Link>` e `router.push` trocam o conteúdo da MESMA aba: o alerta de minuta pronta tiraria o
  // Lúmen da frente e levaria a aba principal para dentro do peticionamento — exatamente o que
  // aquela entrega proibiu. Só `<a target="_blank" rel="noopener">` abre um contexto novo de
  // verdade; e o `rel="noopener"` é obrigatório, senão a aba nova ganha `window.opener` para a aba
  // do Lúmen e pode navegá-la/fechá-la por trás.
  if (alert.abrirEmNovaAba) {
    return (
      <a href={alert.href} target="_blank" rel="noopener" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={alert.href} className={className}>
      {children}
    </Link>
  );
}
