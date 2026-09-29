"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LumenMark from "@/components/LumenMark";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/site/MobileNav";

// Cabeçalho da Capa. Componente cliente por dois comportamentos que usam o MESMO ouvinte (razão de
// serem um componente só): o item do menu acende quando a seção correspondente está na tela, e a
// régua de baixo troca de cinza para bordô depois dos primeiros 40px de rolagem — o sinal de que a
// página saiu do topo, sem mudar altura nenhuma (nenhum deslocamento de layout).
//
// Barra: marca · Produto, Segurança, Planos, Blog, Contato (a partir de 960px) · "Entrar" em
// contorno · alternador de tema e "Criar conta" (a partir de 640px) · hambúrguer (abaixo de 960px).
// Abaixo de 640px a barra é só marca + Entrar + hambúrguer: cinco filhos somavam 467px numa tela de
// 390px e a página rolava para o lado (auditoria da Capa, 29/09/2026). Tema e "Criar conta" moram
// na folha do MobileNav.
//
// "Entrar" fica SEMPRE visível na barra: o app mobile (PWA) só enxerga a Capa depois de um logout,
// e ela é o único jeito de logar de volta sem rolar até o rodapé.
const SECOES = ["produto", "seguranca", "planos"] as const;
type Secao = (typeof SECOES)[number];

export default function SiteHeader() {
  const [rolado, setRolado] = useState(false);
  const [ativa, setAtiva] = useState<Secao | null>(null);

  useEffect(() => {
    const aoRolar = () => setRolado(window.scrollY > 40);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  // IntersectionObserver, não ouvinte de rolagem com cálculo de posição: só acorda quando uma
  // fronteira é cruzada. `rootMargin` desconta os 76px do cabeçalho e 55% da altura embaixo: a seção
  // "ativa" é a que ocupa a faixa de leitura. No topo da página NENHUM item acende (acender "Produto"
  // ali seria mentira).
  useEffect(() => {
    const alvos = SECOES.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (alvos.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visiveis = new Set<string>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.id);
          else visiveis.delete(e.target.id);
        }
        // A ordem de SECOES é a ordem da página: com duas seções visíveis, ganha a de cima.
        setAtiva(SECOES.find((id) => visiveis.has(id)) ?? null);
      },
      { rootMargin: "-76px 0px -55% 0px", threshold: 0 },
    );
    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Uma linha só, a régua de 2px: transparente em repouso, `--regua-forte` no hover, `--marca-tx`
  // quando a seção está na tela (a mesma gramática da guia do produto). `aria-current="true"` e não
  // "page": não é outra página, é outro trecho desta. A cor não carrega o estado sozinha — a régua
  // presente carrega junto (WCAG 1.4.1). A base NÃO traz cor de régua; cada variante traz a sua.
  const baseNav =
    "inline-flex items-center min-h-[44px] pt-0.5 text-capa-mini font-semibold border-b-2 transition-[color,border-color] duration-150 ease-out";
  const itemNav = `${baseNav} text-tx border-transparent hover:border-regua-forte`;
  const marca = (secao: Secao) => (ativa === secao ? `${baseNav} text-marca-tx border-marca-tx` : itemNav);

  return (
    <header
      className={`sticky top-0 z-30 bg-sf-fundo border-b-2 transition-[border-color] duration-150 ease-out ${
        rolado ? "border-marca-tx" : "border-regua-forte"
      }`}
    >
      <div className="capa-faixa h-[76px] flex items-center gap-4">
        <Link href="/" aria-label="Lúmen, início" className="flex items-center gap-2.5 min-h-[44px] font-bold text-destaque tracking-[.16em] shrink-0 mr-auto">
          <LumenMark size={26} /> LÚMEN
        </Link>
        <nav aria-label="Principal" className="hidden min-[960px]:flex items-center gap-7 mr-auto ml-6">
          <a className={marca("produto")} href="#produto" aria-current={ativa === "produto" ? "true" : undefined}>
            Produto
          </a>
          <a className={marca("seguranca")} href="#seguranca" aria-current={ativa === "seguranca" ? "true" : undefined}>
            Segurança
          </a>
          <a className={marca("planos")} href="#planos" aria-current={ativa === "planos" ? "true" : undefined}>
            Planos
          </a>
          <Link className={itemNav} href="/blog">
            Blog
          </Link>
          <a className={itemNav} href="#contato">
            Contato
          </a>
        </nav>
        <div className="flex items-center gap-2 min-[640px]:gap-3">
          <Link
            href="/login"
            className="inline-flex items-center min-h-[44px] px-3 min-[640px]:px-4 border-2 border-regua-forte rounded-[2px] text-capa-mini font-bold hover:bg-acao-bg hover:border-marca-tx transition-[background-color,border-color] duration-100 ease-out"
          >
            Entrar
          </Link>
          <div className="hidden min-[640px]:block">
            <ThemeToggle variant="capa" />
          </div>
          <Link
            href="/cadastro"
            className="hidden min-[640px]:inline-flex items-center min-h-[44px] px-4 bg-acao hover:bg-acao-hover text-acao-tx rounded-[2px] text-capa-mini font-bold transition-[background-color,transform] duration-100 ease-out active:translate-y-px"
          >
            Criar conta
          </Link>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
