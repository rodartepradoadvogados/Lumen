"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAttendance } from "@/lib/actions/attendance";
import { Plus, X } from "lucide-react";

export default function NewAttendanceModal({ users, autoOpen }: { users: { id: string; name: string }[]; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!autoOpen);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
        <Plus size={16} /> Novo Atendimento
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">Novo Atendimento</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await createAttendance({
                  clientName: String(formData.get("clientName")),
                  contact: String(formData.get("contact") || ""),
                  subject: String(formData.get("subject")),
                  area: String(formData.get("area") || ""),
                  description: String(formData.get("description") || ""),
                  channel: String(formData.get("channel")),
                  responsibleId: String(formData.get("responsibleId") || ""),
                });
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              <div>
                <label className="text-xs font-medium text-navy-800/60">Nome do Contato</label>
                <input name="clientName" required className="at-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Assunto (do que se trata)</label>
                <input name="subject" required className="at-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Matéria</label>
                  <select name="area" className="at-input">
                    <option value="">Não definida</option>
                    <option value="Cível">Cível</option>
                    <option value="Trabalhista">Trabalhista</option>
                    <option value="Tributário">Tributário</option>
                    <option value="Família">Família</option>
                    <option value="Sucessões">Sucessões</option>
                    <option value="Criminal">Criminal</option>
                    <option value="Previdenciário">Previdenciário</option>
                    <option value="Empresarial">Empresarial</option>
                    <option value="Consumidor">Consumidor</option>
                    <option value="Administrativo">Administrativo</option>
                    <option value="Outra">Outra</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Canal</label>
                  <select name="channel" className="at-input">
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="TELEFONE">Telefone</option>
                    <option value="PRESENCIAL">Presencial</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Contato</label>
                <input name="contact" className="at-input" placeholder="Telefone/e-mail" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Descrição detalhada do que precisa</label>
                <textarea name="description" rows={3} className="at-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Responsável pela triagem</label>
                <select name="responsibleId" className="at-input">
                  <option value="">Não definido</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Criar"}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .at-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .at-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
