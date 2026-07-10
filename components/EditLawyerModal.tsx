"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLawyer } from "@/lib/actions/contatos";
import { Pencil, X } from "lucide-react";

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
      <button onClick={() => setOpen(true)} data-tip="Editar advogado" className="p-1.5 rounded-lg text-navy-800/30 hover:text-navy-900 hover:bg-cream-100 transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Editar Advogado</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
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
              className="p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-navy-800/60">Nome</label>
                <input name="name" required defaultValue={lawyer.name} className="cl-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">OAB</label>
                  <input name="oab" defaultValue={lawyer.oab || ""} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Lado</label>
                  <select name="side" defaultValue={lawyer.side} className="cl-input">
                    <option value="PARCEIRO">Parceiro</option>
                    <option value="ADVERSO">Adverso</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Escritório</label>
                <input name="firm" defaultValue={lawyer.firm || ""} className="cl-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">E-mail</label>
                  <input name="email" type="email" defaultValue={lawyer.email || ""} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Telefone</label>
                  <input name="phone" defaultValue={lawyer.phone || ""} className="cl-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Observações</label>
                <textarea name="notes" rows={2} defaultValue={lawyer.notes || ""} className="cl-input" />
              </div>
              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .cl-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .cl-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
