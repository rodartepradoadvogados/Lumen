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
    <div className="fixed inset-0 z-[60] bg-navy-950/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-navy-950 rounded-xl border-2 border-gold-300 dark:border-gold-400/30 shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800/8 dark:border-white/10">
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Vincular a um tribunal superior?</h3>
          <button onClick={onClose} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {step === "ASK" && (
            <>
              <p className="text-sm text-navy-800/70 dark:text-cream-50/70">
                <strong>{docTypeLabel}</strong> anexado. Esse tipo de recurso costuma subir de instância — quer indicar agora para qual tribunal este
                processo está indo?
              </p>
              <div className="flex gap-2">
                <button onClick={onClose} className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 px-3 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/10">
                  Agora não
                </button>
                <TribunalPickerModal
                  tribunais={tribunais}
                  onSelect={handlePick}
                  trigger={
                    <span className="inline-flex text-xs font-semibold bg-bordo-700 hover:bg-bordo-600 text-white px-3 py-1.5 rounded-lg cursor-pointer">
                      Vincular tribunal →
                    </span>
                  }
                />
              </div>
            </>
          )}

          {step === "CONFIRM" && picked && (
            <>
              <p className="text-sm text-navy-800 dark:text-cream-50">
                <strong>{picked.sigla}</strong> — {picked.nome}
              </p>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Instância atual</label>
                <select
                  value={instancia}
                  onChange={(e) => setInstancia(e.target.value)}
                  className="w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                >
                  {INSTANCIA_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Seção/Câmara/Turma (opcional)</label>
                <input
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                  placeholder="Ex.: 3ª Câmara Cível do TJGO"
                  className="w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("ASK")}
                  className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 px-3 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/10"
                >
                  Voltar
                </button>
                <button
                  onClick={confirm}
                  disabled={saving}
                  className="flex-1 text-xs font-semibold bg-bordo-700 hover:bg-bordo-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
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
