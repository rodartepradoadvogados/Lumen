"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, createLawyer } from "@/lib/actions/contatos";
import MaskedInput from "@/components/MaskedInput";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
import { Plus } from "lucide-react";
import ModalShell, { type ModalShellSize } from "@/components/ModalShell";

export default function NewContactModal({ kind }: { kind: "client" | "lawyer" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const titles = { client: "Novo Cliente", lawyer: "Novo Advogado" };
  // Cliente tem uma seção inteira a mais (dados para geração de documentos) — merece a largura
  // cheia de 80%. Advogado tem só 6 campos simples; "medio" evita uma janela enorme e vazia.
  const size: ModalShellSize = kind === "client" ? "cheio" : "medio";

  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      if (kind === "client") {
        await createClient({
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
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Não foi possível salvar o cadastro. Tente novamente.");
    }
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
        <ModalShell size={size} title={titles[kind]} onClose={() => setOpen(false)}>
          <form action={submit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
              {error && (
                <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2 mb-3">{error}</p>
              )}
              <div className={kind === "client" ? "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start" : "space-y-3"}>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Nome / Razão Social</label>
                    <input name="name" required className="ct-input" />
                  </div>

                  {kind !== "lawyer" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo</label>
                        <select name="type" className="ct-input">
                          <option value="PF">Pessoa Física</option>
                          <option value="PJ">Pessoa Jurídica</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">CPF/CNPJ</label>
                        <MaskedInput name="document" mask={maskCpfCnpj} className="ct-input" />
                      </div>
                    </div>
                  )}

                  {kind === "lawyer" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">OAB</label>
                        <input name="oab" className="ct-input" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Lado</label>
                        <select name="side" className="ct-input">
                          <option value="PARCEIRO">Parceiro</option>
                          <option value="ADVERSO">Adverso</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {kind === "lawyer" && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Escritório</label>
                      <input name="firm" className="ct-input" />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">E-mail</label>
                      <input name="email" type="email" className="ct-input" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Telefone</label>
                      <MaskedInput name="phone" mask={maskPhone} className="ct-input" />
                    </div>
                  </div>

                  {kind === "client" && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Endereço</label>
                      <input name="address" className="ct-input" />
                    </div>
                  )}

                  {kind === "lawyer" && (
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Observações</label>
                      <textarea name="notes" rows={3} className="ct-input" />
                    </div>
                  )}
                </div>

                {kind === "client" && (
                  <div className="space-y-3">
                    <div className="border border-navy-800/8 dark:border-white/10 rounded-lg p-3 space-y-3">
                      <p className="text-[11px] font-semibold text-navy-800/45 dark:text-cream-50/45 uppercase tracking-wide">Dados para geração de documentos (opcional)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Nacionalidade</label>
                          <input name="nationality" placeholder="brasileiro(a)" className="ct-input" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Estado civil</label>
                          <input name="maritalStatus" placeholder="solteiro(a), casado(a)..." className="ct-input" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Profissão</label>
                          <input name="profession" className="ct-input" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">RG</label>
                          <input name="rg" className="ct-input" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Observações</label>
                      <textarea name="notes" rows={5} className="ct-input" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex justify-end bg-cream-50/60 dark:bg-white/5">
              <button type="submit" disabled={loading} className="bg-gold-600 hover:bg-gold-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Criar"}
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
