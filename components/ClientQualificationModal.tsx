"use client";

import { useState, useTransition } from "react";
import { updateClientQualification } from "@/lib/actions/attendance";
import ConvertAttendanceForm from "@/components/ConvertAttendanceForm";
import { X } from "lucide-react";

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

  function handleSubmit(formData: FormData) {
    setSaved(false);
    startTransition(async () => {
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
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-pop w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 shrink-0">
          <div>
            <h3 className="font-serif font-bold text-navy-900">Complete o cadastro do cliente</h3>
            <p className="text-xs text-navy-800/50 mt-0.5">
              Atendimento criado com sucesso. Complete a qualificação agora ou faça isso depois.
            </p>
          </div>
          <button onClick={onClose} className="text-navy-800/40 hover:text-navy-900">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <form action={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">Tipo</label>
                <select name="type" defaultValue="PF" className="cqm-input">
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">CPF/CNPJ</label>
                <input name="document" className="cqm-input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">RG</label>
                <input name="rg" className="cqm-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Nacionalidade</label>
                <input name="nationality" className="cqm-input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">Estado civil</label>
                <input name="maritalStatus" className="cqm-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Profissão</label>
                <input name="profession" className="cqm-input" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60">Endereço</label>
              <input name="address" className="cqm-input" />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60">Observações</label>
              <textarea name="notes" rows={2} className="cqm-input" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {pending ? "Salvando..." : "Salvar"}
              </button>
              {saved && !pending && <span className="text-xs font-semibold text-green-700">Cadastro atualizado.</span>}
            </div>
          </form>

          <div className="border-t border-navy-800/8 pt-4">
            <p className="text-xs text-navy-800/60 mb-2">Se já for possível, transforme este atendimento em Caso ou Processo agora.</p>
            <ConvertAttendanceForm attendanceId={attendanceId} />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-navy-800/8 flex justify-end shrink-0">
          <button onClick={onClose} className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
            Fechar
          </button>
        </div>
      </div>
      <style jsx global>{`
        .cqm-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .cqm-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </div>
  );
}
