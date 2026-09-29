"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { definirGaveta, gavetaEstaAberta, corpoDaCentral } from "@/lib/gavetaDoTrilho";
import { hrefDaLista } from "@/lib/conversaDaCentral";
import { atalhoDaTecla, indiceVizinho, alvoEstaDigitando } from "@/lib/atalhosDaCentral";

// OS ATALHOS DE TECLADO DA ABA ATENDIMENTOS (A5 do plano de 29/09/2026):
//
//   /        foca a busca da lista
//   ↑ / ↓    conversa anterior / seguinte da lista (abre a conversa)
//   F        abre o menu de fase (o menu é SeletorDeFase; aqui só se avisa)
//   Esc      fecha, nesta ordem: o menu de fase (ele mesmo) → a gaveta do trilho → no celular, volta à
//            lista
//
// REGRA DE OURO: NENHUM atalho age enquanto a pessoa escreve. Em campo de texto (a busca, a caixa de
// resposta, o modal de nova conversa), textarea, select ou contenteditable, a tecla é da pessoa — "f"
// digitado numa mensagem não pode abrir um menu, e a seta dentro do campo move o cursor. Com o modal
// de "Iniciar conversa" aberto, também nada acontece. Teclas com Ctrl/Cmd/Alt ficam para o navegador.
//
// As setas trocam de conversa por `router.push` para o href da própria linha (que já leva o recorte
// de fase/busca) — o mesmo caminho do clique, navegação macia.
//
// A linha selecionada é levada à vista mexendo no `scrollTop` da LISTA, e não com `scrollIntoView`
// (que rola todos os ancestrais; ver o comentário de components/atendimento/RolarParaOFim.tsx).

function hayModalAberto(): boolean {
  return Boolean(document.querySelector(".fixed.inset-0"));
}

function noCelular(): boolean {
  return window.matchMedia("(max-width: 760px)").matches;
}

export default function AtalhosDaCentral() {
  const router = useRouter();

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (hayModalAberto()) return;

      if (e.key === "Escape") {
        // Escrevendo: o Esc só tira o foco do campo — não fecha nada por baixo.
        if (alvoEstaDigitando(e.target as HTMLElement)) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (gavetaEstaAberta()) {
          e.preventDefault();
          definirGaveta(false);
          return;
        }
        if (noCelular() && corpoDaCentral()?.dataset.vista === "conversa") {
          e.preventDefault();
          const p = new URLSearchParams(window.location.search);
          p.delete("id");
          p.delete("foco");
          router.push(`${window.location.pathname}?${p.toString()}`);
        }
        return;
      }

      if (alvoEstaDigitando(e.target as HTMLElement)) return;

      const atalho = atalhoDaTecla(e.key);
      if (atalho === "buscar") {
        const busca = document.getElementById("busca-atendimentos") as HTMLInputElement | null;
        if (!busca) return;
        e.preventDefault();
        busca.focus();
        busca.select();
      } else if (atalho === "fase") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("atd-abrir-fase"));
      } else if (atalho === "proxima" || atalho === "anterior") {
        const linhas = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-lista-de-conversas] li a[data-conversa-id]"));
        if (linhas.length === 0) return;
        e.preventDefault();
        const atual = linhas.findIndex((a) => a.getAttribute("aria-current") === "true");
        const proximo = indiceVizinho(atual, linhas.length, atalho);
        if (proximo === atual) return;
        const alvo = linhas[proximo];
        // Leva a linha à vista dentro da lista, sem rolar mais ninguém.
        const caixa = alvo.closest<HTMLElement>("[data-lista-de-conversas]");
        if (caixa) {
          const c = caixa.getBoundingClientRect();
          const l = alvo.getBoundingClientRect();
          if (l.top < c.top) caixa.scrollTop -= c.top - l.top;
          else if (l.bottom > c.bottom) caixa.scrollTop += l.bottom - c.bottom;
        }
        router.push(alvo.getAttribute("href") ?? hrefDaLista());
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [router]);

  return null;
}
