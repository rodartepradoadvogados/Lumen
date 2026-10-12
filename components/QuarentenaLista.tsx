"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, ShieldQuestion } from "lucide-react";
import { promoverPossivelPublicacao, descartarPossivelPublicacao } from "@/lib/actions/publicacoesFila";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";

export type ItemDeQuarentena = {
  id: string;
  assunto: string | null;
  remetente: string | null;
  motivo: string | null;
  trecho: string;
  processo: string | null;
  chegouEm: string;
};

// "Possível publicação": e-mails que parecem publicação mas não tiveram confiança para entrar na fila
// (remetente desconhecido, número de processo fora do padrão). Nada daqui gera prazo, selo, alerta ou
// notificação até uma pessoa decidir. Regras em lib/emailCaptura.ts.
export default function QuarentenaLista({ itens }: { itens: ItemDeQuarentena[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [permitir, setPermitir] = useState<Record<string, boolean>>({});
  const [bloquear, setBloquear] = useState<Record<string, boolean>>({});

  function agir(fn: () => Promise<{ error?: string }>, ok: string) {
    iniciar(async () => {
      const r = await fn();
      setMsg(r.error ?? ok);
      router.refresh();
    });
  }

  const maisAntiga = itens.length ? itens.reduce((m, i) => (i.chegouEm < m ? i.chegouEm : m), itens[0].chegouEm) : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6" id="fila-publicacoes" tabIndex={-1}>
      <div className="max-w-3xl space-y-4">
        <div className="flex items-start gap-3 border border-regua-forte bg-sf-apoio p-4">
          <ShieldQuestion size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-tx-2" />
          <div className="text-sm text-tx space-y-1">
            <p className="font-semibold">Estes e-mails parecem publicação, mas o Lúmen não teve certeza.</p>
            <p className="text-tx-2">
              Eles <b>não geram prazo, selo nem alerta</b> enquanto estiverem aqui. Promova o que for intimação de verdade; descarte o resto.
              {maisAntiga && <> O mais antigo chegou em {dataDeBrasilia(maisAntiga)}.</>}
            </p>
          </div>
        </div>

        <p role="status" className="text-sm font-semibold text-tx min-h-5">
          {msg}
        </p>

        {itens.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-tx-2 p-4 border border-regua">
            <CircleHelp size={16} aria-hidden="true" /> Nada em quarentena.
          </p>
        )}

        <ul className="list-none m-0 p-0 space-y-3">
          {itens.map((i) => (
            <li key={i.id} className="border border-regua-forte bg-sf p-4 space-y-2">
              <div>
                <p className="font-bold text-tx break-words">{i.assunto || "(sem assunto)"}</p>
                <p className="text-xs text-tx-2 break-words">
                  De {i.remetente || "remetente não registrado"} · chegou em {dataDeBrasilia(i.chegouEm)}
                  {i.processo ? ` · processo ${i.processo}` : ""}
                </p>
                {i.motivo && <p className="mt-1 inline-block px-1.5 border border-linha-aviso bg-aviso-bg text-risco-hoje-tx text-xs">{i.motivo}</p>}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-marca-tx min-h-8 inline-flex items-center">Ver trecho do e-mail</summary>
                <p className="mt-1 whitespace-pre-wrap break-words text-tx-2 max-w-[78ch]">{i.trecho}</p>
              </details>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => agir(() => promoverPossivelPublicacao(i.id, Boolean(permitir[i.id])), "Promovida para a fila.")}
                  className="min-h-11 px-4 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50"
                >
                  Promover à fila
                </button>
                {i.remetente && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-tx-2 min-h-11">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--acao)]" checked={Boolean(permitir[i.id])} onChange={(e) => setPermitir((p) => ({ ...p, [i.id]: e.target.checked }))} />
                    Permitir este remetente daqui em diante
                  </label>
                )}
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => agir(() => descartarPossivelPublicacao(i.id, Boolean(bloquear[i.id])), "Descartada.")}
                  className="min-h-11 px-4 text-sm font-semibold border border-regua-forte text-tx hover:bg-sf-apoio disabled:opacity-50"
                >
                  Descartar
                </button>
                {i.remetente && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-tx-2 min-h-11">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--acao)]" checked={Boolean(bloquear[i.id])} onChange={(e) => setBloquear((p) => ({ ...p, [i.id]: e.target.checked }))} />
                    Bloquear este remetente
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
