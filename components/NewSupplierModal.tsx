"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier } from "@/lib/actions/suppliers";
import MaskedInput from "@/components/MaskedInput";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
import { Plus } from "lucide-react";
import ModalShell from "@/components/ModalShell";

export default function NewSupplierModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <Plus size={16} /> Novo Fornecedor
      </button>
      {open && (
        // "medio", não "cheio": só 4 campos — 80% da tela deixaria a janela quase vazia.
        <ModalShell size="medio" title="Novo Fornecedor" onClose={() => setOpen(false)}>
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
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-tx-2">Nome</label>
                  <input name="name" required className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-tx-2">E-mail</label>
                  <input name="email" type="email" className="cl-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-tx-2">CPF/CNPJ</label>
                  <MaskedInput name="document" mask={maskCpfCnpj} className="cl-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-tx-2">Telefone</label>
                  <MaskedInput name="phone" mask={maskPhone} className="cl-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Observações</label>
                <textarea name="notes" rows={3} className="cl-input" />
              </div>
            </div>
            <div className="shrink-0 border-t border-regua px-5 py-3 flex justify-end bg-sf-apoio">
              <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold px-5 py-2 rounded-lg disabled:opacity-50">
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
