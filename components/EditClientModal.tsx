"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClient } from "@/lib/actions/contatos";
import MaskedInput from "@/components/MaskedInput";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
import { Pencil } from "lucide-react";
import ModalShell from "@/components/ModalShell";

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
  const [error, setError] = useState("");

  return (
    <>
      <button onClick={() => setOpen(true)} data-tip="Editar cliente" className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors">
        <Pencil size={14} />
      </button>
      {open && (
        <ModalShell size="cheio" title="Editar Cliente" onClose={() => setOpen(false)}>
          <form
            action={async (formData) => {
              setLoading(true);
              setError("");
              try {
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
              } catch (err) {
                setLoading(false);
                setError(err instanceof Error ? err.message : "Não foi possível salvar as alterações. Tente novamente.");
              }
            }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
              {error && (
                <p className="text-xs text-urgente bg-urgente-bg px-3 py-2 mb-3">{error}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-tx-2">Nome / Razão Social</label>
                    <input name="name" required defaultValue={client.name} className="ct-input" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-tx-2">Tipo</label>
                      <select name="type" defaultValue={client.type} className="ct-input">
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">CPF/CNPJ</label>
                      <MaskedInput name="document" mask={maskCpfCnpj} defaultValue={client.document || ""} className="ct-input" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-tx-2">E-mail</label>
                      <input name="email" type="email" defaultValue={client.email || ""} className="ct-input" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Telefone</label>
                      <MaskedInput name="phone" mask={maskPhone} defaultValue={client.phone || ""} className="ct-input" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-tx-2">Endereço</label>
                    <input name="address" defaultValue={client.address || ""} className="ct-input" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="border border-regua p-3 space-y-3">
                    <p className="text-[11px] font-semibold text-tx-2 uppercase tracking-wide">Dados para geração de documentos</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-tx-2">Nacionalidade</label>
                        <input name="nationality" placeholder="brasileiro(a)" defaultValue={client.nationality || ""} className="ct-input" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-tx-2">Estado civil</label>
                        <input name="maritalStatus" placeholder="solteiro(a), casado(a)..." defaultValue={client.maritalStatus || ""} className="ct-input" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-tx-2">Profissão</label>
                        <input name="profession" defaultValue={client.profession || ""} className="ct-input" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-tx-2">RG</label>
                        <input name="rg" defaultValue={client.rg || ""} className="ct-input" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-tx-2">Observações</label>
                    <textarea name="notes" rows={5} defaultValue={client.notes || ""} className="ct-input" />
                  </div>
                </div>
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
        .ct-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .ct-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
        .dark .ct-input { border-color: rgba(255,255,255,0.15); background: #0f1f3d; color: #fbfaf7; }
      `}</style>
    </>
  );
}
