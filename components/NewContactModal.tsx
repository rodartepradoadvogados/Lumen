"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, createLawyer } from "@/lib/actions/contatos";
import { Plus, X } from "lucide-react";

export default function NewContactModal({ kind }: { kind: "client" | "lawyer" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const titles = { client: "Novo Cliente", lawyer: "Novo Advogado" };

  async function submit(formData: FormData) {
    setLoading(true);
    if (kind === "client") {
      await createClient({
        name: String(formData.get("name")),
        type: String(formData.get("type")),
        document: String(formData.get("document") || ""),
        email: String(formData.get("email") || ""),
        phone: String(formData.get("phone") || ""),
        address: String(formData.get("address") || ""),
        notes: String(formData.get("notes") || ""),
      });
    } else {
      await createLawyer({
        name: String(formData.get("name")),
        oab: String(formData.get("oab") || ""),
        firm: String(formData.get("firm") || ""),
        side: String(formData.get("side")),
        email: String(formData.get("email") || ""),
        phone: String(formData.get("phone") || ""),
        notes: String(formData.get("notes") || ""),
      });
    }
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> {titles[kind]}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">{titles[kind]}</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form action={submit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-navy-800/60">Nome / Razão Social</label>
                <input name="name" required className="ct-input" />
              </div>

              {kind !== "lawyer" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Tipo</label>
                    <select name="type" className="ct-input">
                      <option value="PF">Pessoa Física</option>
                      <option value="PJ">Pessoa Jurídica</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">CPF/CNPJ</label>
                    <input name="document" className="ct-input" />
                  </div>
                </div>
              )}

              {kind === "lawyer" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">OAB</label>
                    <input name="oab" className="ct-input" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-navy-800/60">Lado</label>
                    <select name="side" className="ct-input">
                      <option value="PARCEIRO">Parceiro</option>
                      <option value="ADVERSO">Adverso</option>
                    </select>
                  </div>
                </div>
              )}

              {kind === "lawyer" && (
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Escritório</label>
                  <input name="firm" className="ct-input" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">E-mail</label>
                  <input name="email" type="email" className="ct-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Telefone</label>
                  <input name="phone" className="ct-input" />
                </div>
              </div>

              {kind === "client" && (
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Endereço</label>
                  <input name="address" className="ct-input" />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-navy-800/60">Observações</label>
                <textarea name="notes" rows={2} className="ct-input" />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Criar"}
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
