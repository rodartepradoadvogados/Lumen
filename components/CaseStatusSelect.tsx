"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCaseStatus } from "@/lib/actions/cases";

const options = ["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"];

// O <select> mostrava o enum cru em caixa alta ("ATIVO", "ARQUIVADO"). Mesmo defeito que a lista
// de Despesas tinha com o status financeiro — ver financeStatusLabel em components/ui.tsx.
const labels: Record<string, string> = {
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  ENCERRADO: "Encerrado",
  ARQUIVADO: "Arquivado",
};

const colors: Record<string, string> = {
  ATIVO: "bg-concluido-bg text-concluido border-transparent",
  SUSPENSO: "bg-aviso-bg text-aviso border-transparent",
  ENCERRADO: "bg-sf-apoio text-tx-2 border-transparent",
  ARQUIVADO: "bg-urgente-bg text-urgente border-transparent",
};

// Porta 3 da apuração do êxito (Fase 4) — barreira, não bloqueio: ao tentar arquivar um processo
// que ainda tem honorário percentual "a apurar", avisa antes de concluir mas sempre deixa o sócio
// arquivar mesmo assim (às vezes o desfecho só será conhecido/lançado depois, ou nunca vai gerar
// receita e ninguém vai voltar aqui só para registrar isso). "Abrir apuração" só leva para a aba
// Financeiro do processo — é lá que mora o botão "Registrar desfecho" (ApurarHonorarioModal), com
// tudo que ele precisa (bases, contas bancárias etc.); duplicar a janela aqui não valeria a pena.
export default function CaseStatusSelect({
  caseId,
  status,
  hasPendingApuracao = false,
}: {
  caseId: string;
  status: string;
  hasPendingApuracao?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirmArquivar, setConfirmArquivar] = useState(false);

  function applyStatus(value: string) {
    startTransition(async () => {
      await updateCaseStatus(caseId, value);
      router.refresh();
    });
  }

  function handleChange(value: string) {
    if (value === "ARQUIVADO" && hasPendingApuracao && status !== "ARQUIVADO") {
      setConfirmArquivar(true);
      return;
    }
    applyStatus(value);
  }

  return (
    <div className="relative">
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${colors[status]}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o] ?? o}
          </option>
        ))}
      </select>

      {confirmArquivar && (
        <div className="absolute right-0 top-full mt-2 z-20 w-72 border border-regua bg-sf shadow-menu p-3.5 text-left origin-top-right motion-safe:animate-popup-in">
          <p className="text-xs font-semibold text-tx">Este processo tem honorário a apurar.</p>
          <p className="text-[11px] text-tx-2 mt-1">Informar o desfecho agora, antes de arquivar?</p>
          <div className="flex flex-col gap-1.5 mt-3">
            <button
              type="button"
              onClick={() => {
                setConfirmArquivar(false);
                router.push(`/processos/${caseId}?tab=financeiro`);
              }}
              className="text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-1.5 "
            >
              Abrir apuração
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmArquivar(false);
                applyStatus("ARQUIVADO");
              }}
              className="text-xs font-semibold text-atencao hover:bg-atencao/10 px-3 py-1.5 "
            >
              Arquivar mesmo assim
            </button>
            <button
              type="button"
              onClick={() => setConfirmArquivar(false)}
              className="text-xs font-medium text-tx-2 hover:text-tx px-3 py-1.5 "
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
