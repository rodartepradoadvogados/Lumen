"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LumenMark from "@/components/LumenMark";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/site/MobileNav";

// Cabeçalho do site público. Virou componente cliente para atender dois itens do roteiro de
// dinamismo aprovados pelo dono em 2026-09-16 — e os dois usam o MESMO ouvinte, que é a razão de
// serem um componente só e não dois:
//
//   D2 · o item do cabeçalho acende quando a seção correspondente está na tela. Antes, "Produto" e
//        "Preço" tinham exatamente a mesma aparência estivesse o leitor onde estivesse na página.
//   D8 · a régua de baixo do cabeçalho troca de cinza para bordô depois dos primeiros 40px de
//        rolagem — o sinal de que a página saiu do topo, sem mudar altura nenhuma (nenhum
//        deslocamento de layout no conteúdo abaixo).
//
// Nada aqui depende de dado de servidor: o cabeçalho sempre foi marcação estática. O que a
// fronteira cliente custa é o JS deste arquivo, e nada mais — a página inteira continua renderizada
// no servidor.
//
// "Entrar" fica FORA do <nav> escondido em telas estreitas de propósito: o app mobile (PWA) só
// enxerga esta homepage depois de um logout, e nela era o único jeito de alcançar /login. Com
// "Entrar" preso em "hidden md:flex", a barra em largura de celular mostrava só "Começar"
// (→/cadastro): quem saía do sistema e tentava entrar de novo caía sempre no cadastro, sem forma
// visível de logar sem rolar até o rodapé.

const SECOES = ["recursos", "preco"] as const;
type Secao = (typeof SECOES)[number];

export default function SiteHeader({
  navLink,
  btnPrimary,
}: {
  navLink: string;
  btnPrimary: string;
}) {
  const [rolado, setRolado] = useState(false);
  const [ativa, setAtiva] = useState<Secao | null>(null);

  // D8 — um só booleano, atualizado por ouvinte passivo. `scrollY > 40` é o mesmo limiar do
  // roteiro; abaixo dele o cabeçalho é o do topo da página, e o estado não pisca porque a régua
  // só tem dois valores possíveis.
  useEffect(() => {
    const aoRolar = () => setRolado(window.scrollY > 40);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  // D2 — IntersectionObserver, não ouvinte de rolagem com cálculo de posição: o observador só
  // acorda quando uma fronteira é cruzada, e não a cada quadro de rolagem.
  //
  // `rootMargin` desconta os 76px do próprio cabeçalho no topo e 55% da altura embaixo, de modo
  // que a seção "ativa" é a que ocupa a faixa de leitura, não a que encostou o primeiro pixel.
  // Duas consequências deliberadas: no topo da página NENHUM item acende (não há seção na faixa
  // de leitura ainda, e acender "Produto" ali seria mentira), e a troca acontece quando o leitor
  // já está de fato lendo a seção seguinte.
  useEffect(() => {
    const alvos = SECOES.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (alvos.length === 0 || typeof IntersectionObserver === "undefined") return;

    const visiveis = new Set<string>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.id);
          else visiveis.delete(e.target.id);
        }
        // A ordem de SECOES é a ordem da página: com duas seções visíveis ao mesmo tempo,
        // ganha a de cima, que é a que o leitor está terminando de ler.
        setAtiva(SECOES.find((id) => visiveis.has(id)) ?? null);
      },
      { rootMargin: "-76px 0px -55% 0px", threshold: 0 },
    );
    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Os itens de seção NÃO usam o `navLink` compartilhado, de propósito. Aquele estilo marca o
  // hover por cor do sublinhado (text-decoration), e um item que também precisa de estado ATIVO
  // acabaria com duas linhas a 4px uma da outra — a do sublinhado e a da régua. Aqui a linha é
  // uma só, e é a régua de 2px: transparente em repouso, `--regua-forte` no hover, `--acao`
  // quando a seção está na tela. É a mesma gramática da guia do produto (a aba que sobe da
  // gaveta), que é a assinatura formal do sistema.
  //
  // `aria-current="true"` e não `="page"`: não é outra página, é outro trecho desta. E a cor não
  // carrega o estado sozinha (WCAG 1.4.1) — a espessura e a presença da régua carregam junto.
  // A base NÃO traz cor de régua nenhuma, e cada variante traz a sua: duas utilitárias de
  // `border-color` na mesma string competem por ordem de geração do Tailwind, não por ordem de
  // escrita — foi assim que uma classe morta passou despercebida antes neste repositório.
  const baseNav =
    "inline-block py-2 text-sm font-semibold border-b-2 transition-[color,border-color] duration-150 ease-out";
  const itemNav = `${baseNav} text-tx border-transparent hover:border-regua-forte`;
  const marca = (secao: Secao) =>
    ativa === secao ? `${baseNav} text-marca-tx border-marca-tx` : itemNav;

  return (
    <header
      className={`sticky top-0 z-30 bg-sf border-b-2 transition-[border-color] duration-150 ease-out ${
        rolado ? "border-marca-tx" : "border-regua-forte"
      }`}
    >
      <div className="max-w-[1120px] mx-auto px-6 h-[76px] flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-lg tracking-[.16em] shrink-0">
          <LumenMark size={26} /> LÚMEN
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <a className={marca("recursos")} href="#recursos" aria-current={ativa === "recursos" ? "true" : undefined}>
            Produto
          </a>
          <a className={marca("preco")} href="#preco" aria-current={ativa === "preco" ? "true" : undefined}>
            Preço
          </a>
          <Link className={itemNav} href="/blog">
            Blog
          </Link>
        </nav>
        <div className="flex items-center gap-4 sm:gap-6">
          <Link className={navLink} href="/login">
            Entrar
          </Link>
          {/* Alternador de tema — a auditoria de 2026-09-16 achou que o tema escuro alcança TODA
              página pública (o script de tema em app/layout.tsx aplica a classe a partir do
              armazenamento, em qualquer rota) e que NENHUMA delas tinha alternador. Quem escolhia
              "Noite" dentro do produto e fazia logout ficava preso, sem porta de volta a não ser
              limpar o armazenamento do navegador. O tema sempre funcionou; faltava a porta. */}
          <ThemeToggle />
          <Link href="/cadastro" className={btnPrimary}>
            Começar
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
