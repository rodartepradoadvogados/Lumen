"use client";

import { useState } from "react";
import { Pin, PinOff } from "lucide-react";
import { desafixarMensagem } from "@/lib/actions/mensagemFixada";
import type { FixadaDoChat } from "@/lib/mensagemFixada";

// A MENSAGEM FIXADA, NO TOPO DA CONVERSA (PR 10): uma linha com o trecho, que leva à mensagem quando ela está
// na tela, e o botão de desafixar (44 px). Vale para a equipe com acesso ao atendimento. Sem faixa lateral
// colorida: o pino e o rótulo "Fixada" dizem o que é.

export default function FixadaDoChatTopo({
  idDaConversa,
  fixada,
  aoIr,
  aoDesafixar,
}: {
  idDaConversa: string;
  fixada: FixadaDoChat;
  aoIr: (mensagemId: string) => void;
  aoDesafixar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function desafixar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await desafixarMensagem(idDaConversa);
      if (r.erro) setErro(r.erro);
      else aoDesafixar();
    } catch {
      setErro("Não foi possível desafixar. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section aria-label="Mensagem fixada" data-fixada="" className="shrink-0 border-b border-regua-forte bg-sf-apoio">
      <div className="flex items-stretch">
        <button type="button" onClick={() => aoIr(fixada.mensagemId)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left">
          <Pin size={15} aria-hidden="true" className="shrink-0 text-tx-2" />
          <span className="min-w-0">
            <span className="block text-etiqueta font-bold text-tx-2">
              Fixada · {fixada.autor}
              {fixada.fixadaPorNome ? ` · por ${fixada.fixadaPorNome}` : ""}
            </span>
            <span className="line-clamp-2 block break-words text-corpo text-tx [overflow-wrap:anywhere]">{fixada.trecho}</span>
            <span className="sr-only">Toque para ir até a mensagem.</span>
          </span>
        </button>
        <button type="button" onClick={desafixar} disabled={ocupado} aria-label="Desafixar mensagem" className="inline-flex h-auto min-h-11 w-11 shrink-0 items-center justify-center text-tx-2 hover:bg-sf disabled:opacity-60">
          <PinOff size={17} aria-hidden="true" />
        </button>
      </div>
      {erro && (
        <p role="alert" className="px-3 pb-1.5 text-etiqueta font-semibold text-urgente">
          {erro}
        </p>
      )}
    </section>
  );
}
