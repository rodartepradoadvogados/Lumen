"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClient } from "@/lib/actions/contatos";
import { Pencil, X } from "lucide-react";

type ClientData = {
  id: string;
  name: string;
  type: string;
  document: string | null;
  rg: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  profession: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export default function EditClientModal({ client }: { client: ClientData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar cliente" className="p-1.5 rounded-lg text-navy-800/30 hover:text-navy-900 hover:bg-cream-100 transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Editar Cliente</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await updateClient(client.id, {
                  name: String(formData.get("name")),
                  type: String(formData.get("type")),
                  document: String(formData.get("document") || ""),
                  rg: String(formData.get("rg") || ""),
                  nationality: String(formData.get("nationality") || ""),
                  maritalStatus: String(formData.get("maritalStatus") || ""),
                  profession: String(formData.get("profession") || ""),
                  email: String(formData.get("email") || ""),
                  phone: String(formData.get("phone") || ""),
                  address: String(formData.get("address") || ""),
                  notes: String(formData.get("notes") || ""),
                });
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-navy-800/60">Nome / Razão Social</label>
                <input name="name" required defaultValue={client.name} className="ct-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Tipo</label>
                  <select name="type" defaultValue={client.type} className="ct-input">
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">CPF/CNPJ</label>
                  <input name="document" defaultValue={client.document || ""} className="ct-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">E-mail</label>
                  <input name="email" type="email" defaultValue={client.email || ""} className="ct-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Telefone</label>
                  <input name="phone" defaultValue={client.phone || ""} className="ct-input" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Endereço</label>
                <input name="address" defaultValue={client.address || ""} className="ct-input" />
              </div>

              <div className="border-t border-navy-800/8 pt-3 space-y-3">
                <p className="text-[11px] font-semibold text-navy-800/45 uppercase tracking-wide">Dados para geração de documentos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Nacionalidade</label>
                    <input name="nationality" placeholder="brasileiro(a)" defaultValue={client.nationality || ""} className="ct-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Estado civil</label>
                    <input name="maritalStatus" placeholder="solteiro(a), casado(a)..." defaultValue={client.maritalStatus || ""} className="ct-input" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Profissão</label>
                    <input name="profession" defaultValue={client.profession || ""} className="ct-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">RG</label>
                    <input name="rg" defaultValue={client.rg || ""} className="ct-input" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-navy-800/60">Observações</label>
                <textarea name="notes" rows={2} defaultValue={client.notes || ""} className="ct-input" />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .ct-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .ct-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
