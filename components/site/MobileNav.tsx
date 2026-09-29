"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// Toque não tinha recibo nenhum aqui: o link acendia no instante do dedo e apagava no
// instante seguinte, sem transição. `active:` é o estado que importa em tela de toque —
// `hover:` em celular é um fantasma que gruda depois do toque.
const overlayLink = "flex items-center min-h-[52px] px-6 text-base font-semibold text-tx border-b border-regua transition-colors duration-100 ease-out active:bg-acao-bg";

// Abaixo do breakpoint `md`, o <nav> do cabeçalho (Produto/Preço/Blog) desaparece: este hambúrguer é
// o único jeito de alcançá-los em viewport mobile.
//
// "Entrar" fica de fora deste menu de propósito (ver comentário em SiteHeader): precisa continuar
// visível sem toque extra — é o único jeito de logar de volta depois de um logout no PWA, e
// escondê-lo atrás do hambúrguer reintroduziria esse problema.
//
// O alternador de tema e o botão "Criar conta" MORAM AQUI abaixo de `sm`. A barra tinha cinco filhos
// (marca, Entrar, tema, Começar, hambúrguer) que somavam 467px numa tela de 390px: a página rolava
// para o lado e o botão do menu ficava em x=467, fora da tela. Só apertar os espaços não bastava
// (sobravam ~375px); o que cabe em 320px é marca + Entrar + hambúrguer.
export default function MobileNav({ btnPrimary }: { btnPrimary: string }) {
  const [open, setOpen] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);

  // Folha aberta: o resto da página sai da ordem de tabulação e do leitor de tela (`inert`), Esc
  // fecha e devolve o foco ao botão, e a rolagem do fundo fica travada.
  useEffect(() => {
    const alvos = Array.from(document.querySelectorAll<HTMLElement>("main, footer"));
    alvos.forEach((el) => {
      el.inert = open;
    });
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        botao.current?.focus();
      }
    };
    // Redimensionar para o desktop com a folha aberta a fecharia por baixo dos panos: o botão some
    // (`md:hidden`) e a página ficaria travada e inerte.
    const mq = window.matchMedia("(min-width: 768px)");
    const aoRedimensionar = () => {
      if (mq.matches) setOpen(false);
    };
    document.addEventListener("keydown", aoTeclar);
    mq.addEventListener("change", aoRedimensionar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      mq.removeEventListener("change", aoRedimensionar);
      alvos.forEach((el) => {
        el.inert = false;
      });
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={botao}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="folha-menu"
        className="h-11 w-11 flex items-center justify-center -mr-2 text-tx transition-colors duration-100 ease-out active:bg-acao-bg"
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {open && (
        // A folha desce do cabeçalho de onde foi puxada (Movimento 9 · abrir menu, globals.css),
        // em vez de aparecer cravada por cima da página. Só entrada: a saída é desmontagem do
        // React e não tem estado para animar.
        <nav
          id="folha-menu"
          aria-label="Menu"
          className="animate-menu-desce fixed inset-x-0 top-[76px] bottom-0 z-40 bg-sf overflow-y-auto overscroll-contain pb-8"
        >
          <a href="#recursos" className={overlayLink} onClick={() => setOpen(false)}>
            Produto
          </a>
          <a href="#preco" className={overlayLink} onClick={() => setOpen(false)}>
            Preço
          </a>
          <Link href="/blog" className={overlayLink} onClick={() => setOpen(false)}>
            Blog
          </Link>
          <ThemeToggle variant="folha" />
          <div className="px-6 pt-6">
            <Link href="/cadastro" className={`${btnPrimary} w-full !justify-center`} onClick={() => setOpen(false)}>
              Criar a conta do escritório
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
