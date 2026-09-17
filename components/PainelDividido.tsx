"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// DUAS COLUNAS COM DIVISÓRIA ARRASTÁVEL.
//
// Pedido do dono em 17/09/2026, sobre a Agenda do portal:
//
//   "A parte do calendário tem que ficar um pouco mais estreita, para ser possível ler melhor o
//    que está do lado direito... Encurte 10% da largura do calendário e alargue 10% da barra de
//    descrição das atividades da direita. Isso é o padrão, mas eu gostaria de deixar isso de modo
//    com uma linha que possa ser arrastada para a direita ou para a esquerda... como limite, 15%
//    para um lado ou outro. A linha que estou pedindo é invisível, apenas aparecendo quando passar
//    o mouse em cima."
//
// Três decisões que valem estar escritas:
//
// 1 · O PADRÃO EM PONTOS PERCENTUAIS, não em pixels. A Agenda tinha `xl:grid-cols-[1fr_360px]`:
//     o painel do dia era 360px FIXOS, então numa tela de 1900px ele valia 19% e num notebook de
//     1440px valia 25%. "10% mais estreito" não teria significado estável contra um valor fixo.
//     Aqui as duas colunas são percentuais da caixa, e o deslocamento de 10 pontos é o mesmo em
//     qualquer tela: 80/20 vira 70/30.
//
// 2 · O LIMITE É DE PONTOS PERCENTUAIS, não relativo. ±15 pontos a partir do padrão dá a faixa
//     55%–85%. Abaixo de 55% as sete colunas do mês ficam estreitas demais para um título de
//     compromisso; acima de 85% o painel do dia volta a ser a tira ilegível que originou o pedido.
//
// 3 · A LINHA É INVISÍVEL ATÉ O PONTEIRO CHEGAR — mas a ÁREA DE PEGA não é invisível para o
//     ponteiro: são 18px de alvo, com a linha de 2px desenhada por dentro. Um alvo de 2px seria
//     honesto com o pedido e impossível de acertar. Ela também é alcançável por teclado (Tab, e
//     setas movem de 1 em 1 ponto; Home volta ao padrão), porque uma divisória que só o mouse
//     ajusta exclui quem navega sem ele.
//
// A escolha fica no localStorage POR VIEWER, não no banco: é preferência de janela, não dado do
// escritório, e sincronizá-la entre dispositivos faria o notebook herdar a divisão escolhida no
// monitor grande. Leitura e escrita são protegidas: em aba anônima ou com dados do site
// bloqueados, o acessor lança, e aí a divisória simplesmente volta ao padrão.
export default function PainelDividido({
  esquerda,
  direita,
  chave,
  rotulo,
  padrao = 70,
  amplitude = 15,
  className = "",
}: {
  esquerda: ReactNode;
  direita: ReactNode;
  /** Chave de localStorage — distinta por tela, para telas diferentes não brigarem pela mesma. */
  chave: string;
  /** O que a divisória separa, para leitor de tela. */
  rotulo: string;
  /** Largura da coluna da esquerda, em % da caixa. */
  padrao?: number;
  /** Quantos pontos percentuais a divisória anda para cada lado. */
  amplitude?: number;
  className?: string;
}) {
  const min = padrao - amplitude;
  const max = padrao + amplitude;
  const [pct, setPct] = useState(padrao);
  const [arrastando, setArrastando] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  const limitar = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n * 10) / 10)), [min, max]);

  // Só depois da hidratação: o servidor não conhece o localStorage, e ler no primeiro render
  // faria o HTML do servidor e o do cliente divergirem.
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(chave);
      const n = guardado === null ? NaN : Number(guardado);
      if (Number.isFinite(n)) setPct(limitar(n));
    } catch {
      // localStorage pode lançar (aba anônima, dados do site bloqueados) — fica o padrão.
    }
  }, [chave, limitar]);

  function gravar(n: number) {
    try {
      window.localStorage.setItem(chave, String(n));
    } catch {
      // idem: não gravar é aceitável, perder a tela não é.
    }
  }

  function daPosicao(clientX: number): number | null {
    const r = caixaRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return limitar(((clientX - r.left) / r.width) * 100);
  }

  return (
    <div
      ref={caixaRef}
      className={`painel-dividido ${className}`}
      style={{ "--divisao": `${pct}%` } as CSSProperties}
    >
      <div className="min-w-0 flex flex-col min-h-0">{esquerda}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={rotulo}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        data-arrastando={arrastando ? "true" : undefined}
        className="divisor hidden xl:block"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setArrastando(true);
        }}
        onPointerMove={(e) => {
          if (!arrastando) return;
          const n = daPosicao(e.clientX);
          if (n !== null) setPct(n);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          setArrastando(false);
          gravar(pct);
        }}
        onDoubleClick={() => {
          setPct(padrao);
          gravar(padrao);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home") return;
          e.preventDefault();
          const n = e.key === "Home" ? padrao : limitar(pct + (e.key === "ArrowLeft" ? -1 : 1));
          setPct(n);
          gravar(n);
        }}
      />

      <div className="min-w-0 flex flex-col min-h-0">{direita}</div>
    </div>
  );
}
