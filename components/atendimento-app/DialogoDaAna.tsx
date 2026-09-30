"use client";

import { useEffect, useRef } from "react";

// O POP-UP DE CONFIRMAÇÃO DA ANA (diálogo modal): `role="dialog"` + `aria-modal`, nomeado pelo título, foco preso entre
// "Não" e "Sim" (o foco começa em "Não", o lado seguro), Esc fecha (não enquanto grava), e o foco VOLTA para quem estava
// focado ao abrir. Botões de 44 px. Enquanto a ação roda, os dois ficam desabilitados e o "Sim" mostra "…". O erro real
// da ação aparece aqui dentro com `role="alert"` (o pop-up fica aberto: quem tocou vê o motivo).
export default function DialogoDaAna({
  titulo,
  texto,
  sim,
  nao,
  ocupado = false,
  ocupadoTexto,
  erro,
  aoSim,
  aoNao,
}: {
  titulo: string;
  texto?: string;
  sim: string;
  nao: string;
  ocupado?: boolean;
  /** Ex.: "Ana está respondendo…" — dito ao leitor de tela e à vista enquanto a ação roda. */
  ocupadoTexto?: string;
  erro?: string | null;
  aoSim: () => void;
  aoNao: () => void;
}) {
  const botaoNao = useRef<HTMLButtonElement>(null);
  const botaoSim = useRef<HTMLButtonElement>(null);
  const aoNaoVivo = useRef(aoNao);
  aoNaoVivo.current = aoNao;
  const ocupadoVivo = useRef(ocupado);
  ocupadoVivo.current = ocupado;

  const caixa = useRef<HTMLDivElement>(null);
  // Ao gravar os dois botões se desabilitam e o foco cairia no corpo da página: fica no próprio diálogo.
  useEffect(() => {
    if (ocupado) caixa.current?.focus();
  }, [ocupado]);

  useEffect(() => {
    const voltarPara = document.activeElement as HTMLElement | null;
    botaoNao.current?.focus();
    return () => {
      if (voltarPara && voltarPara.isConnected) voltarPara.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          if (!ocupadoVivo.current) aoNaoVivo.current();
          return;
        }
        if (e.key === "Tab") {
          const alvos = [botaoNao.current, botaoSim.current].filter((b): b is HTMLButtonElement => !!b && !b.disabled);
          if (alvos.length === 0) {
            e.preventDefault();
            return;
          }
          const primeiro = alvos[0];
          const ultimo = alvos[alvos.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault();
            ultimo.focus();
          } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primeiro.focus();
          } else if (!alvos.includes(document.activeElement as HTMLButtonElement)) {
            e.preventDefault();
            primeiro.focus();
          }
        }
      }}
    >
      <div
        ref={caixa}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogo-ana-titulo"
        aria-describedby={texto ? "dialogo-ana-texto" : undefined}
        aria-busy={ocupado}
        data-dialogo-da-ana=""
        className="w-full max-w-sm rounded-atd-flutuante bg-atd-tela p-4 text-atd-tinta"
      >
        <h2 id="dialogo-ana-titulo" className="text-destaque font-semibold">
          {titulo}
        </h2>
        {texto && (
          <p id="dialogo-ana-texto" className="mt-1 text-corpo text-atd-previa">
            {texto}
          </p>
        )}
        {ocupado && ocupadoTexto && (
          <p role="status" className="mt-2 text-corpo text-atd-previa">
            {ocupadoTexto}
          </p>
        )}
        {erro && (
          <p role="alert" className="mt-2 text-corpo font-semibold text-urgente">
            {erro}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button ref={botaoNao} type="button" onClick={aoNao} disabled={ocupado} className="min-h-11 rounded-atd-pilula bg-atd-pilula-2 px-3 text-corpo font-semibold text-atd-tinta disabled:opacity-60">
            {nao}
          </button>
          <button ref={botaoSim} type="button" onClick={aoSim} disabled={ocupado} className="min-h-11 rounded-atd-pilula bg-atd-ouro px-3 text-corpo font-semibold text-atd-ouro-tx disabled:opacity-60">
            {ocupado ? "…" : sim}
          </button>
        </div>
      </div>
    </div>
  );
}
