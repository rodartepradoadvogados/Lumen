"use client";

import { useState, useTransition } from "react";
import { updateClientQualification } from "@/lib/actions/attendance";
import ConvertAttendanceForm from "@/components/ConvertAttendanceForm";
import MaskedInput from "@/components/MaskedInput";
import { maskCpfCnpj } from "@/lib/masks";
import { X } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

export default function ClientQualificationModal({
  clientId,
  attendanceId,
  onClose,
}: {
  clientId: string;
  attendanceId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(formData: FormData) {
    setSaved(false);
    setError("");
    startTransition(async () => {
      try {
        await updateClientQualification(clientId, {
          type: String(formData.get("type") || ""),
          document: String(formData.get("document") || ""),
          rg: String(formData.get("rg") || ""),
          nationality: String(formData.get("nationality") || ""),
          maritalStatus: String(formData.get("maritalStatus") || ""),
          profession: String(formData.get("profession") || ""),
          address: String(formData.get("address") || ""),
          notes: String(formData.get("notes") || ""),
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível salvar o cadastro. Tente novamente.");
      }
    });
  }

  useEscapeToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
      <div className="bg-sf rounded-xl shadow-pop w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-regua shrink-0">
          <div>
            <h3 className="font-bold text-tx">Complete o cadastro do cliente</h3>
            <p className="text-xs text-tx-3 mt-0.5">
              Atendimento criado com sucesso. Complete a qualificação agora ou faça isso depois.
            </p>
          </div>
          <button onClick={onClose} className="text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <form action={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-tx-2">Tipo</label>
                <select name="type" defaultValue="PF" className="cqm-input">
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">CPF/CNPJ</label>
                <MaskedInput name="document" mask={maskCpfCnpj} className="cqm-input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-tx-2">RG</label>
                <input name="rg" className="cqm-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Nacionalidade</label>
                <input name="nationality" className="cqm-input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-tx-2">Estado civil</label>
                <input name="maritalStatus" className="cqm-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Profissão</label>
                <input name="profession" className="cqm-input" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-tx-2">Endereço</label>
              <input name="address" className="cqm-input" />
            </div>
            <div>
              <label className="text-xs font-medium text-tx-2">Observações</label>
              <textarea name="notes" rows={2} className="cqm-input" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
              >
                {pending ? "Salvando..." : "Salvar"}
              </button>
              {saved && !pending && <span className="text-xs font-semibold text-concluido">Cadastro atualizado.</span>}
              {error && !pending && <span className="text-xs font-semibold text-urgente">{error}</span>}
            </div>
          </form>

          <div className="border-t border-regua pt-4">
            <p className="text-xs text-tx-2 mb-2">Se já for possível, transforme este atendimento em Caso ou Processo agora.</p>
            <ConvertAttendanceForm attendanceId={attendanceId} />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-regua flex justify-end shrink-0">
          <button onClick={onClose} className="text-xs font-semibold text-tx-3 hover:text-tx">
            Fechar
          </button>
        </div>
      </div>
      <style jsx global>{`
        .cqm-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid var(--regua-forte);
          border-radius: 0.3125rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: var(--sf-superficie);
          color: var(--tx);
        }
        .cqm-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--acao-bg);
        }
      `}</style>
    </div>
  );
}
