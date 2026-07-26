"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startActingAsOffice } from "@/lib/officeActing";
import { ACCESS_REASONS, SESSION_MINUTES, type AccessReasonCode } from "@/lib/supportAccessConstants";
import { Building2, X } from "lucide-react";

// Substitui o antigo botão direto de "atuar como" (que só chamava startActingAsOffice(officeId)
// sem pedir nada) por um formulário que exige motivo (lista fechada, nunca texto livre) e
// assunto do chamado — os dois viram AccessRequest/SupportTicket em lib/supportAccess.ts. Sem
// esse mínimo, não há o que auditar depois.
export default function StartActingModal({ officeId }: { officeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Passo 3a: quando o escritório exige aprovação, startActingAsOffice devolve pending=true em
  // vez de um erro genérico — detectado por esse booleano, não por comparação do texto de
  // `error` (frágil, quebra se o texto do backend mudar). Enquanto aguardaAprovacao for true, o
  // modal troca o botão "Confirmar e entrar" por "Tentar novamente", que reenvia os mesmos
  // dados: se enquanto isso um sócio aprovou o pedido, openSupportAccess acha o AccessRequest
  // APROVADO sem sessão e abre a sessão de verdade (caso "a" da máquina de estado).
  const [aguardaAprovacao, setAguardaAprovacao] = useState(false);
  const [reasonCode, setReasonCode] = useState<AccessReasonCode>("CONFIG_INTEGRACAO");
  const [ticketSubject, setTicketSubject] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  function submit() {
    if (!ticketSubject.trim()) {
      setError("Informe o assunto do chamado.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startActingAsOffice(officeId, {
        reasonCode,
        ticketSubject: ticketSubject.trim(),
        reasonNote: reasonNote.trim() || undefined,
      });
      if (result?.error) {
        setError(result.error);
        setAguardaAprovacao(Boolean(result.pending));
        return;
      }
      setAguardaAprovacao(false);
      setOpen(false);
      router.push("/painel");
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-lg px-3 py-2"
      >
        <Building2 size={13} /> Entrar como este escritório
      </button>
      <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1.5">
        Pra ajudar a configurar Drive, DJEN ou e-mail junto com o dono. Sessão de {SESSION_MINUTES} minutos, registrada e
        visível ao escritório — sai a qualquer momento pelo aviso no topo, dos dois lados.
      </p>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-lg text-navy-900 dark:text-cream-50">Entrar como escritório</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <p
                  className={`text-xs rounded-lg px-3 py-2 ${
                    aguardaAprovacao
                      ? "text-gold-700 dark:text-gold-400 bg-gold-500/15 dark:bg-gold-400/15"
                      : "text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15"
                  }`}
                >
                  {aguardaAprovacao
                    ? "Pedido enviado. Assim que for aprovado, clique em Tentar novamente."
                    : error}
                </p>
              )}

              <div>
                <label className="text-xs font-semibold text-navy-800 dark:text-cream-50 block mb-1">Motivo</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as AccessReasonCode)}
                  className="w-full border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(ACCESS_REASONS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-navy-800 dark:text-cream-50 block mb-1">Assunto do chamado</label>
                <input
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Ex.: cliente relatou erro ao anexar documento"
                  className="w-full border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 dark:placeholder:text-cream-50/30 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-navy-800 dark:text-cream-50 block mb-1">Observação (opcional)</label>
                <textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                  className="w-full border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 bg-cream-100 dark:bg-white/5 rounded-lg px-3 py-2">
                O acesso dura {SESSION_MINUTES} minutos, fica registrado com motivo e chamado, e é visível ao escritório em
                tempo real — com botão para encerrar a qualquer momento do lado deles.
              </p>

              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
              >
                {pending ? "Abrindo…" : aguardaAprovacao ? "Tentar novamente" : "Confirmar e entrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
