"use client";

import { useEffect, useRef } from "react";

// A MOLDURA DA CONVERSA EM TELA CHEIA, com a altura do que o aparelho DE FATO mostra.
//
// O PROBLEMA DO TECLADO VIRTUAL: `fixed inset-0` cobre a altura do layout, e no iOS (e no Chrome do
// Android recente) o teclado NÃO encolhe o layout — encolhe só a viewport visual. O campo de mensagem, colado no
// pé, ficaria escondido atrás do teclado. A altura vem de `visualViewport.height` (e o topo de
// `visualViewport.offsetTop`, porque o iOS rola a página para mostrar o campo focado); `100dvh` e
// `interactive-widget` não bastam (o iOS ignora). Com o zoom de pinça (`scale !== 1`) nada é mexido.
//
// COM O TECLADO ABERTO (viewport visual baixa em aparelho de toque ou tela estreita) a barra da Ana e as
// guias se escondem para dar espaço à conversa: `data-teclado="on"` + a regra em app/globals.css.
const ALTURA_DE_TECLADO_ABERTO = 520;

export default function TelaCheiaDaConversa({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const ajustar = () => {
      if (vv.scale && Math.abs(vv.scale - 1) > 0.01) {
        el.style.height = "";
        el.style.top = "";
        el.style.bottom = "";
        return;
      }
      el.style.top = `${Math.round(vv.offsetTop)}px`;
      el.style.bottom = "auto";
      el.style.height = `${Math.round(vv.height)}px`;
      const toque = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      el.dataset.teclado = vv.height < ALTURA_DE_TECLADO_ABERTO && (toque || window.innerWidth <= 480) ? "on" : "off";
    };
    ajustar();
    vv.addEventListener("resize", ajustar);
    vv.addEventListener("scroll", ajustar);
    return () => {
      vv.removeEventListener("resize", ajustar);
      vv.removeEventListener("scroll", ajustar);
    };
  }, []);

  return (
    <div ref={ref} data-tela-da-conversa="" data-teclado="off" className="fixed inset-0 z-40 flex justify-center bg-sf-fundo">
      {children}
    </div>
  );
}
