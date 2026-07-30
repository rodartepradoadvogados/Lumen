"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendCaseEmail } from "@/lib/actions/cases";
import { Mail, X } from "lucide-react";

type TeamMember = { id: string; name: string; email: string };

// Um advogado escreve e manda um e-mail para outro (ou pra qualquer endereço) direto de dentro
// do processo — sai NA HORA, nunca agendado, usando a conta pessoal (Google/Outlook) que o
// próprio remetente já conectou em Configurações (mesmo mecanismo do Atendimento). Fica
// registrado como comentário do processo, na aba Comentários.
export default function SendCaseEmailModal({ caseId, users }: { caseId: string; users: TeamMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [useOther, setUseOther] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 dark:bg-gold-600 dark:hover:bg-gold-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Mail size={15} /> Enviar E-mail
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Enviar E-mail</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                setError("");
                const to = useOther ? String(formData.get("toOther") || "") : String(formData.get("toUser") || "");
                const result = await sendCaseEmail(caseId, to, String(formData.get("subject") || ""), String(formData.get("body") || ""));
                setLoading(false);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              {error && (
                <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Destinatário</label>
                  <button
                    type="button"
                    onClick={() => setUseOther((v) => !v)}
                    className="text-[11px] font-semibold text-gold-700 dark:text-gold-400 hover:underline"
                  >
                    {useOther ? "Escolher membro da equipe" : "Digitar outro e-mail"}
                  </button>
                </div>
                {useOther ? (
                  <input
                    name="toOther"
                    type="email"
                    required
                    placeholder="nome@exemplo.com"
                    className="w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                  />
                ) : (
                  <select
                    name="toUser"
                    required
                    className="w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecionar...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.email}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Assunto</label>
                <input
                  name="subject"
                  required
                  className="w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Mensagem</label>
                <textarea
                  name="body"
                  required
                  rows={6}
                  className="w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm resize-y max-h-[40vh]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar agora"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
