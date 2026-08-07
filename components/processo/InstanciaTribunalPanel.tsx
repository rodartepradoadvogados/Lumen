"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retornarInstanciaAnterior } from "@/lib/actions/cases";
import { INSTANCIA_OPTIONS, instanciaLabel } from "@/lib/caseInstance";
import { formatDate } from "@/components/ui";
import { Undo2, History } from "lucide-react";

export type CaseInstanceHistoryEntry = {
  id: string;
  order: number;
  fromInstance: string | null;
  fromTribunalSigla: string | null;
  toInstance: string;
  toTribunalSigla: string;
  toInstanceDetail: string | null;
  escalatedAt: string;
  returnedAt: string | null;
};

// Instância atual + seção/câmara/turma (dentro do form principal do EditCaseModal, por isso os
// dois <select>/<input> daqui têm name= e são lidos junto do resto) + o par origem/atual, o botão
// de retorno (ação própria, fora do form principal — mesmo motivo do SettleButton/SettleModal não
// ficarem dentro do form de Editar Processo: mexe num histórico à parte, não faz sentido competir
// com "Salvar") e o histórico completo de escaladas (ver getCaseInstanceHistory, lib/actions/
// cases.ts — cada escalada empilha um registro, "retorno dos autos" desempilha um de cada vez).
export default function InstanciaTribunalPanel({
  caseId,
  currentInstance,
  currentInstanceDetail,
  tribunalOrigemSigla,
  tribunalOrigemNome,
  origemInstance,
  history = [],
  inputClassName,
}: {
  caseId: string;
  currentInstance: string | null;
  currentInstanceDetail: string | null;
  tribunalOrigemSigla: string | null;
  tribunalOrigemNome: string | null;
  origemInstance: string | null;
  history?: CaseInstanceHistoryEntry[];
  inputClassName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const temOrigem = Boolean(tribunalOrigemSigla);

  async function handleRetornar() {
    if (!window.confirm("Marcar retorno dos autos à instância anterior? O tribunal e a instância atuais voltam para o que estavam antes da última escalada.")) return;
    setLoading(true);
    const result = await retornarInstanciaAnterior(caseId);
    setLoading(false);
    if (result.error) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Instância atual</label>
          <select name="currentInstance" defaultValue={currentInstance ?? ""} className={inputClassName}>
            <option value="">Não definida</option>
            {INSTANCIA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Seção/Câmara/Turma</label>
          <input
            name="currentInstanceDetail"
            defaultValue={currentInstanceDetail ?? ""}
            placeholder="Ex.: 3ª Câmara Cível do TJGO"
            className={inputClassName}
          />
        </div>
      </div>

      {temOrigem && (
        <div className="flex items-center justify-between gap-2 bg-cream-100 dark:bg-white/5 rounded-lg px-3 py-2">
          <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60">
            Veio de <strong>{instanciaLabel(origemInstance)}</strong>
            {tribunalOrigemSigla && (
              <>
                {" "}
                ({tribunalOrigemSigla} — {tribunalOrigemNome})
              </>
            )}
          </p>
          <button
            type="button"
            onClick={handleRetornar}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 px-2 py-1 rounded-lg hover:bg-cream-100 dark:hover:bg-white/10 disabled:opacity-50"
          >
            <Undo2 size={12} /> {loading ? "Retornando..." : "Marcar retorno dos autos"}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
          >
            <History size={12} /> {showHistory ? "Ocultar" : "Ver"} histórico de instância ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-1.5 space-y-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 text-[11px] text-navy-800/60 dark:text-cream-50/60 border-b border-navy-800/5 dark:border-white/10 pb-1 last:border-0">
                  <span>
                    {h.order}ª: {instanciaLabel(h.fromInstance)} → {instanciaLabel(h.toInstance)} ({h.toTribunalSigla})
                    {h.toInstanceDetail && ` — ${h.toInstanceDetail}`}
                    <span className="text-navy-800/40 dark:text-cream-50/40"> · {formatDate(h.escalatedAt)}</span>
                  </span>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${h.returnedAt ? "bg-cream-200 dark:bg-white/10 text-navy-800/50 dark:text-cream-50/50" : "bg-gold-500/15 text-gold-700 dark:text-gold-400"}`}>
                    {h.returnedAt ? `Revertida em ${formatDate(h.returnedAt)}` : "Ativa"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
