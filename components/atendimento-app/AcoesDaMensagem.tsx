"use client";

import { useEffect, useRef, useState } from "react";
import { CornerUpLeft, Pin, PinOff, X } from "lucide-react";
import { desafixarMensagem, fixarMensagem } from "@/lib/actions/mensagemFixada";
import { trechoDaMensagem, type FixadaDoChat } from "@/lib/mensagemFixada";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";

// O MENU DA MENSAGEM (PR 10): Responder e Fixar no topo. Abre pelo botão "Mais ações" ao lado do balão (alvo de
// 44 px; nunca só por gesto de segurar). Diálogo com foco no primeiro botão, Esc e o botão Fechar. Fixar e
// desafixar chamam as ações com a guarda do atendimento; o resultado volta pela tela e pela atualização de 15 s.
//
// RESPONDER É UMA CITAÇÃO SÓ NA SUA TELA: o WhatsApp permite responder "em cima" de uma mensagem (`context`), mas
// isso muda o que se envia e, com ele, a chave de idempotência do envio (a mesma chave com outro alvo seria
// "outro texto"). Enquanto isso não for desenhado, a citação ajuda quem escreve a não se perder, e o cliente NÃO a
// vê. O texto do menu diz isso.

const BOTAO = "flex min-h-11 w-full items-center gap-2.5 rounded-atd-balao bg-atd-pilula px-3.5 py-2 text-left text-corpo font-semibold text-atd-tinta hover:bg-atd-pilula-2 disabled:opacity-60";

export default function AcoesDaMensagem({
  m,
  idDaConversa,
  autor,
  fixadaAgora,
  aoResponder,
  aoMudarFixada,
  aoFechar,
}: {
  m: MensagemDoChat;
  idDaConversa: string;
  autor: string;
  fixadaAgora: boolean;
  aoResponder: (m: MensagemDoChat) => void;
  aoMudarFixada: (f: FixadaDoChat | null) => void;
  aoFechar: () => void;
}) {
  const primeiro = useRef<HTMLButtonElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const voltarPara = document.activeElement as HTMLElement | null;
    primeiro.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      voltarPara?.focus?.();
    };
  }, [aoFechar]);

  async function alternarFixada() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      if (fixadaAgora) {
        const r = await desafixarMensagem(idDaConversa);
        if (r.erro) return setErro(r.erro);
        aoMudarFixada(null);
      } else {
        const r = await fixarMensagem(idDaConversa, m.id);
        if (r.erro !== undefined) return setErro(r.erro);
        aoMudarFixada(r.fixada);
      }
      aoFechar();
    } catch {
      setErro("Não foi possível concluir. Confira a internet e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="acoes-titulo" className="w-full rounded-t-[20px] bg-atd-tela p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-atd-tinta" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="acoes-titulo" className="text-destaque font-bold">
              Mensagem de {autor}, {m.hora}
            </h2>
            <p className="mt-0.5 line-clamp-3 break-words text-corpo text-atd-previa [overflow-wrap:anywhere]">{trechoDaMensagem(m.midia ? `[${m.midia.rotulo.toLowerCase()}] ${m.texto}` : m.texto, 200)}</p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-atd-previa hover:bg-atd-linha-hover">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button ref={primeiro} type="button" onClick={() => { aoResponder(m); aoFechar(); }} className={BOTAO}>
            <CornerUpLeft size={16} aria-hidden="true" className="shrink-0" />
            <span>
              Responder a esta mensagem
              <span className="block text-app-meta font-normal text-atd-previa">A citação aparece só para você. O cliente não a vê.</span>
            </span>
          </button>
          <button type="button" onClick={alternarFixada} disabled={ocupado} className={BOTAO}>
            {fixadaAgora ? <PinOff size={16} aria-hidden="true" className="shrink-0" /> : <Pin size={16} aria-hidden="true" className="shrink-0" />}
            <span>
              {ocupado ? "Aguarde…" : fixadaAgora ? "Desafixar do topo" : "Fixar no topo da conversa"}
              <span className="block text-app-meta font-normal text-atd-previa">A equipe com acesso a este atendimento vê a mensagem fixada.</span>
            </span>
          </button>
        </div>
        {erro && (
          <p role="alert" className="mt-2 text-corpo font-medium text-urgente">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
