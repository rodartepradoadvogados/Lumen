"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCaseStatus } from "@/lib/actions/cases";

const options = ["ATIVO", "SUSPENSO", "ENCERRADO", "ARQUIVADO"];

const colors: Record<string, string> = {
  ATIVO: "bg-emerald-100 text-emerald-700 border-emerald-200",
  SUSPENSO: "bg-amber-100 text-amber-700 border-amber-200",
  ENCERRADO: "bg-slate-100 text-slate-600 border-slate-200",
  ARQUIVADO: "bg-red-100 text-red-700 border-red-200",
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
            {o}
          </option>
        ))}
      </select>

      {confirmArquivar && (
        <div className="absolute right-0 top-full mt-2 z-20 w-72 rounded-lg border border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900 shadow-pop p-3.5 text-left">
          <p className="text-xs font-semibold text-navy-900 dark:text-cream-50">Este processo tem honorário a apurar.</p>
          <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 mt-1">Informar o desfecho agora, antes de arquivar?</p>
          <div className="flex flex-col gap-1.5 mt-3">
            <button
              type="button"
              onClick={() => {
                setConfirmArquivar(false);
                router.push(`/processos/${caseId}?tab=financeiro`);
              }}
              className="text-xs font-semibold text-white bg-navy-900 dark:bg-gold-500 dark:text-navy-950 hover:bg-navy-800 dark:hover:bg-gold-400 px-3 py-1.5 rounded-lg"
            >
              Abrir apuração
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmArquivar(false);
                applyStatus("ARQUIVADO");
              }}
              className="text-xs font-semibold text-bordo-700 dark:text-bordo-400 hover:bg-bordo-100 dark:hover:bg-bordo-400/15 px-3 py-1.5 rounded-lg"
            >
              Arquivar mesmo assim
            </button>
            <button
              type="button"
              onClick={() => setConfirmArquivar(false)}
              className="text-xs font-medium text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-3 py-1.5 rounded-lg"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
