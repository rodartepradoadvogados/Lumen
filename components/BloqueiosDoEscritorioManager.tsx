"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { removerBloqueioDoEscritorio, removerRegraDeRemetente } from "@/lib/actions/publicacoesFila";

export type BloqueioDoEscritorioRow = { id: string; displayNumber: string; motivo: string | null; createdAt: string };
export type RegraDeRemetenteRow = { id: string; padrao: string; acao: string; createdAt: string };

// O que o escritório inteiro bloqueou/permitiu na triagem de publicações: processos ("Não é do
// escritório" + bloquear) e remetentes de e-mail. Tudo reversível aqui, só por administrador; cada
// remoção também entra na trilha de auditoria (Privacidade → Publicações).
export default function BloqueiosDoEscritorioManager({ processos, regras, isAdmin }: { processos: BloqueioDoEscritorioRow[]; regras: RegraDeRemetenteRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function remover(fn: () => Promise<{ error?: string }>) {
    iniciar(async () => {
      const r = await fn();
      setMsg(r.error ?? "Removido.");
      router.refresh();
    });
  }

  if (processos.length === 0 && regras.length === 0) {
    return <p className="p-5 text-sm text-tx-2">Nenhum processo nem remetente bloqueado pelo escritório.</p>;
  }

  const botao = "shrink-0 flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 bg-sf-apoio hover:bg-regua disabled:opacity-50";
  return (
    <div>
      <p role="status" className="px-5 pt-3 text-sm font-semibold text-tx min-h-5">
        {msg}
      </p>
      {processos.length > 0 && (
        <div>
          <h3 className="px-5 pt-2 text-xs font-bold uppercase tracking-wide text-tx-2">Processos</h3>
          <div className="divide-y divide-regua">
            {processos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tx truncate">{p.displayNumber}</p>
                  <p className="text-etiqueta text-tx-2">
                    Bloqueado em {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                    {p.motivo ? ` · ${p.motivo}` : ""}
                  </p>
                </div>
                {isAdmin && (
                  <button type="button" disabled={pendente} onClick={() => remover(() => removerBloqueioDoEscritorio(p.id))} className={botao}>
                    <RotateCcw size={13} aria-hidden="true" /> Reverter
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {regras.length > 0 && (
        <div>
          <h3 className="px-5 pt-3 text-xs font-bold uppercase tracking-wide text-tx-2">Remetentes de e-mail</h3>
          <div className="divide-y divide-regua">
            {regras.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tx truncate">{r.padrao}</p>
                  <p className="text-etiqueta text-tx-2">
                    {r.acao === "NEGAR" ? "Bloqueado" : "Permitido"} em {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {isAdmin && (
                  <button type="button" disabled={pendente} onClick={() => remover(() => removerRegraDeRemetente(r.id))} className={botao}>
                    <RotateCcw size={13} aria-hidden="true" /> Remover regra
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!isAdmin && <p className="px-5 py-3 text-xs text-tx-2">Só administradores podem reverter.</p>}
    </div>
  );
}
