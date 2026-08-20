"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Opções fechadas do motivo da perda (Fase 5) — item que alimenta o relatório de captação.
// "Outro" exige um texto livre além da caixinha, para o motivo nunca ficar vazio.
const CLOSED_REASONS = ["Preço", "Prazo", "Escolheu outro escritório", "Desistiu da ação", "Sem resposta", "Fora da nossa área"];

export default function AttendanceLostReasonModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [otherText, setOtherText] = useState("");
  const isOther = selected === "Outro";
  const canConfirm = Boolean(selected) && (!isOther || otherText.trim().length > 0);

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(isOther ? otherText.trim() : selected);
  }

  useEscapeToClose(true, onCancel);

  return (
    <div className="fixed inset-0 z-[70] bg-grafite-900/40 flex items-center justify-center p-4">
      <div className="bg-sf shadow-pop w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className=" font-bold text-tx">Motivo da perda</h3>
          <button onClick={onCancel} className="text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-tx-2">
          Obrigatório para mover este atendimento para &quot;Perdido&quot; — é o que alimenta o relatório de captação.
        </p>
        <div className="space-y-1.5">
          {CLOSED_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm text-tx-2 cursor-pointer">
              <input type="radio" name="lostReason" checked={selected === r} onChange={() => setSelected(r)} />
              {r}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-tx-2 cursor-pointer">
            <input type="radio" name="lostReason" checked={isOther} onChange={() => setSelected("Outro")} />
            Outro
          </label>
          {isOther && (
            <input
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Descreva o motivo"
              autoFocus
              className="w-full mt-1 text-sm border border-regua bg-sf text-tx px-2.5 py-1.5"
            />
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2 disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            onClick={onCancel}
            className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
