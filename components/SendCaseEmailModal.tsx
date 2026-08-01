"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendCaseEmail } from "@/lib/actions/cases";
import { Mail } from "lucide-react";
import ModalShell from "@/components/ModalShell";

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
        // "medio": é um compositor de e-mail, não um formulário de muitos campos — o que ganha
        // com mais espaço é a altura da mensagem, não a largura da janela inteira (linhas de
        // texto muito longas ficam mais difíceis de ler, não mais fáceis).
        <ModalShell size="medio" title="Enviar E-mail" onClose={() => setOpen(false)}>
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
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3 flex flex-col">
              {error && (
                <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              </div>
              <div className="flex-1 flex flex-col min-h-[12rem]">
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Mensagem</label>
                <textarea
                  name="body"
                  required
                  className="flex-1 w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex justify-end bg-cream-50/60 dark:bg-white/5">
              <button
                type="submit"
                disabled={loading}
                className="bg-gold-600 hover:bg-gold-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar agora"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}
