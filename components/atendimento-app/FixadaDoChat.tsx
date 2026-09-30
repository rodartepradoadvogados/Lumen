"use client";

import { useState } from "react";
import { Pin, PinOff } from "lucide-react";
import { desafixarMensagem } from "@/lib/actions/mensagemFixada";
import type { FixadaDoChat } from "@/lib/mensagemFixada";

// A MENSAGEM FIXADA, NO TOPO DA CONVERSA (PR 10): uma PÍLULA de uma linha com "Fixada" e o trecho, que leva à mensagem quando ela está
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
    <section aria-label="Mensagem fixada" data-fixada="" className="mx-3 mt-2 shrink-0 rounded-atd-balao bg-atd-pilula">
      <div className="flex items-stretch">
        <button type="button" onClick={() => aoIr(fixada.mensagemId)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-atd-balao px-3 py-1.5 text-left">
          <Pin size={16} aria-hidden="true" className="shrink-0 text-atd-texto-ouro" />
          <span className="min-w-0 flex-1 truncate text-app-previa text-atd-previa">
            <span className="mr-1.5 font-semibold text-atd-texto-ouro">Fixada</span>
            {fixada.trecho}
          </span>
          <span className="sr-only">
            Mensagem de {fixada.autor}
            {fixada.fixadaPorNome ? `, fixada por ${fixada.fixadaPorNome}` : ""}. Toque para ir até a mensagem.
          </span>
        </button>
        <button type="button" onClick={desafixar} disabled={ocupado} aria-label="Desafixar mensagem" className="inline-flex h-auto min-h-11 w-11 shrink-0 items-center justify-center rounded-full text-atd-previa hover:text-atd-tinta disabled:opacity-60">
          <PinOff size={17} aria-hidden="true" />
        </button>
      </div>
      {erro && (
        <p role="alert" className="px-3 pb-1.5 text-app-meta font-semibold text-urgente">
          {erro}
        </p>
      )}
    </section>
  );
}
