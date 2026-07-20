"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier } from "@/lib/actions/suppliers";
import { Plus, X } from "lucide-react";

export default function NewSupplierModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <Plus size={16} /> Novo Fornecedor
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Novo Fornecedor</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await createSupplier({
                  name: String(formData.get("name")),
                  document: String(formData.get("document") || ""),
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
                <input name="name" required className="cl-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">CPF/CNPJ</label>
                  <input name="document" className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Telefone</label>
                  <input name="phone" className="cl-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">E-mail</label>
                <input name="email" type="email" className="cl-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Observações</label>
                <textarea name="notes" rows={2} className="cl-input" />
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
