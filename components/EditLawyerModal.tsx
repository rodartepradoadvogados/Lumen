"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLawyer } from "@/lib/actions/contatos";
import MaskedInput from "@/components/MaskedInput";
import { maskPhone } from "@/lib/masks";
import { Pencil } from "lucide-react";
import ModalShell from "@/components/ModalShell";

type LawyerData = {
  id: string;
  name: string;
  oab: string | null;
  firm: string | null;
  side: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export default function EditLawyerModal({ lawyer }: { lawyer: LawyerData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar advogado" className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        // "medio", não "cheio": só 6 campos simples — 80% da tela deixaria a janela quase vazia.
        <ModalShell size="medio" title="Editar Advogado" onClose={() => setOpen(false)}>
          <form
            action={async (formData) => {
              setLoading(true);
              await updateLawyer(lawyer.id, {
                name: String(formData.get("name")),
                oab: String(formData.get("oab") || ""),
                firm: String(formData.get("firm") || ""),
                side: String(formData.get("side")),
                email: String(formData.get("email") || ""),
                phone: String(formData.get("phone") || ""),
                notes: String(formData.get("notes") || ""),
              });
              setLoading(false);
              setOpen(false);
              router.refresh();
            }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-tx-2">Nome</label>
                  <input name="name" required defaultValue={lawyer.name} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-tx-2">Escritório</label>
                  <input name="firm" defaultValue={lawyer.firm || ""} className="cl-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-tx-2">OAB</label>
                  <input name="oab" defaultValue={lawyer.oab || ""} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-tx-2">Lado</label>
                  <select name="side" defaultValue={lawyer.side} className="cl-input">
                    <option value="PARCEIRO">Parceiro</option>
                    <option value="ADVERSO">Adverso</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-tx-2">E-mail</label>
                  <input name="email" type="email" defaultValue={lawyer.email || ""} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-tx-2">Telefone</label>
                  <MaskedInput name="phone" mask={maskPhone} defaultValue={lawyer.phone || ""} className="cl-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Observações</label>
                <textarea name="notes" rows={3} defaultValue={lawyer.notes || ""} className="cl-input" />
              </div>
            </div>
            <div className="shrink-0 border-t border-regua px-5 py-3 flex justify-end bg-sf-apoio">
              <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold px-5 py-2 disabled:opacity-50">
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
      <style jsx global>{`
        .cl-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .cl-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
        .dark .cl-input { border-color: rgba(255,255,255,0.15); background: #0f1f3d; color: #fbfaf7; }
      `}</style>
    </>
  );
}
