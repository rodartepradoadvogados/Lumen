"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { escalarTribunalSuperior } from "@/lib/actions/cases";
import { INSTANCIA_OPTIONS, suggestInstanceForCategoria } from "@/lib/caseInstance";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import TribunalPickerModal from "@/components/TribunalPickerModal";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Pop-up disparado ao anexar um recurso que costuma subir de instância (ver
// lib/documentTypes.ts:isRecursoQueEscalaInstancia, chamado por components/AttachmentList.tsx) —
// nunca bloqueia o anexo em si, que já foi salvo antes deste componente aparecer. "Agora não"
// simplesmente fecha; os mesmos campos continuam editáveis a qualquer momento em Editar Processo
// (components/processo/InstanciaTribunalPanel.tsx).
export default function RecursoEscalaPrompt({
  caseId,
  docTypeLabel,
  tribunais,
  onClose,
}: {
  caseId: string;
  docTypeLabel: string;
  tribunais: TribunalCatalogEntry[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"ASK" | "CONFIRM">("ASK");
  const [picked, setPicked] = useState<TribunalCatalogEntry | null>(null);
  const [instancia, setInstancia] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEscapeToClose(true, onClose);

  function handlePick(t: TribunalCatalogEntry) {
    setPicked(t);
    setInstancia(suggestInstanceForCategoria(t.categoria));
    setStep("CONFIRM");
  }

  async function confirm() {
    if (!picked) return;
    setSaving(true);
    setError("");
    const result = await escalarTribunalSuperior(caseId, {
      tribunalSigla: picked.sigla,
      tribunalNome: picked.nome,
      tribunalSistema: picked.sistemas,
      tribunalLink: picked.portalUrl,
      currentInstance: instancia,
      currentInstanceDetail: detalhe.trim() || undefined,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-grafite-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-sf border-2 border-marca/40 shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-regua">
          <h3 className=" font-bold text-tx text-sm">Vincular a um tribunal superior?</h3>
          <button onClick={onClose} className="text-tx-3 hover:text-tx">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {step === "ASK" && (
            <>
              <p className="text-sm text-tx-2">
                <strong>{docTypeLabel}</strong> anexado. Esse tipo de recurso costuma subir de instância — quer indicar agora para qual tribunal este
                processo está indo?
              </p>
              <div className="flex gap-2">
                <button onClick={onClose} className="text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio">
                  Agora não
                </button>
                <TribunalPickerModal
                  tribunais={tribunais}
                  onSelect={handlePick}
                  trigger={
                    <span className="inline-flex text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-1.5 cursor-pointer">
                      Vincular tribunal →
                    </span>
                  }
                />
              </div>
            </>
          )}

          {step === "CONFIRM" && picked && (
            <>
              <p className="text-sm text-tx">
                <strong>{picked.sigla}</strong> — {picked.nome}
              </p>
              <div>
                <label className="text-xs font-medium text-tx-2">Instância atual</label>
                <select
                  value={instancia}
                  onChange={(e) => setInstancia(e.target.value)}
                  className="w-full mt-1 border border-regua bg-sf text-tx px-3 py-2 text-sm"
                >
                  {INSTANCIA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Seção/Câmara/Turma (opcional)</label>
                <input
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                  placeholder="Ex.: 3ª Câmara Cível do TJGO"
                  className="w-full mt-1 border border-regua bg-sf text-tx px-3 py-2 text-sm"
                />
              </div>
              {error && <p className="text-xs text-urgente bg-urgente-bg px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("ASK")}
                  className="text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio"
                >
                  Voltar
                </button>
                <button
                  onClick={confirm}
                  disabled={saving}
                  className="flex-1 text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-1.5 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
