"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// A FILA VIVA (DESIGN.md §9, 15/10/2026) — a lista de conversas que se reordena sem saltar.
//
// A lista é do servidor: a cada 15 s (AtualizarAoVivo) ou depois de uma ação, o `router.refresh()`
// devolve as linhas já na ordem nova. Sem isto a linha que recebeu mensagem SALTAVA para o topo e
// quem estava lendo a lista perdia o fio — não dava para ver QUEM passou a esperar. Aqui cada
// atualização é medida antes e depois (FLIP): a linha que mudou de lugar desliza da posição antiga
// para a nova, e a que recebeu mensagem ganha `data-chegou` (o fundo em ouro suave que se apaga e o
// selo que acende uma vez — app/globals.css).
//
// O contrato com quem usa: cada item da lista é um elemento com
//   data-linha-viva="<id>"   identidade estável da linha;
//   data-marca="<iso>"       a última atividade (muda quando chega ou sai mensagem);
//   data-esperando="sim"     o cliente escreveu e ninguém respondeu.
// A primeira pintura não anima nada: só as atualizações seguintes.
//
// Medido em relação ao topo da própria lista, e não da janela: se quem lê rolou a lista entre uma
// atualização e outra, a rolagem não vira um deslize falso.
export default function ListaViva({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const antes = useRef<Map<string, { topo: number; marca: string }> | null>(null);

  useLayoutEffect(() => {
    const lista = ref.current;
    if (!lista) return;
    const base = lista.getBoundingClientRect().top;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const agora = new Map<string, { topo: number; marca: string }>();
    for (const el of Array.from(lista.querySelectorAll<HTMLElement>("[data-linha-viva]"))) {
      const id = el.dataset.linhaViva as string;
      const marca = el.dataset.marca ?? "";
      const topo = el.getBoundingClientRect().top - base;
      agora.set(id, { topo, marca });
      const anterior = antes.current?.get(id);
      if (!anterior) continue;
      const chegou = marca !== anterior.marca && el.dataset.esperando === "sim";
      if (chegou) {
        // Reinicia a animação mesmo que o atributo já estivesse lá (duas mensagens seguidas).
        el.removeAttribute("data-chegou");
        void el.offsetWidth;
        el.setAttribute("data-chegou", "");
      }
      const delta = anterior.topo - topo;
      if (!reduzir && Math.abs(delta) > 1 && typeof el.animate === "function") {
        el.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], {
          duration: chegou ? 620 : 460,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        });
      }
    }
    antes.current = agora;
  });

  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
