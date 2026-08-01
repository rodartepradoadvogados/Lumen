"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSupplier } from "@/lib/actions/suppliers";
import MaskedInput from "@/components/MaskedInput";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
import { Pencil } from "lucide-react";
import ModalShell from "@/components/ModalShell";

type SupplierData = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export default function EditSupplierModal({ supplier }: { supplier: SupplierData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar fornecedor" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/5 transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        // "medio", não "cheio": só 4 campos — 80% da tela deixaria a janela quase vazia.
        <ModalShell size="medio" title="Editar Fornecedor" onClose={() => setOpen(false)}>
          <form
            action={async (formData) => {
              setLoading(true);
              await updateSupplier(supplier.id, {
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
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Nome</label>
                  <input name="name" required defaultValue={supplier.name} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">E-mail</label>
                  <input name="email" type="email" defaultValue={supplier.email || ""} className="cl-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">CPF/CNPJ</label>
                  <MaskedInput name="document" mask={maskCpfCnpj} defaultValue={supplier.document || ""} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Telefone</label>
                  <MaskedInput name="phone" mask={maskPhone} defaultValue={supplier.phone || ""} className="cl-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Observações</label>
                <textarea name="notes" rows={3} defaultValue={supplier.notes || ""} className="cl-input" />
              </div>
            </div>
            <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex justify-end bg-cream-50/60 dark:bg-white/5">
              <button type="submit" disabled={loading} className="bg-gold-600 hover:bg-gold-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50">
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
