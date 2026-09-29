"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// `active:` é o estado que importa em tela de toque — `hover:` em celular é um fantasma que gruda
// depois do toque.
const item =
  "flex items-center min-h-[56px] px-4 min-[640px]:px-8 text-destaque font-semibold text-tx border-b border-regua transition-colors duration-100 ease-out active:bg-acao-bg";

// Folha do menu, abaixo de 960px (onde a navegação da barra some). Além das seções, carrega o que
// saiu da barra estreita: o alternador de tema (Manhã/Noite) e o botão principal. "Entrar" fica na
// barra de propósito (ver SiteHeader): é o único jeito de logar de volta depois de um logout no
// PWA, e escondê-lo atrás do hambúrguer reintroduziria esse problema.
//
// Aberta: o resto da página sai da ordem de tabulação e do leitor de tela (`inert`), a rolagem do
// fundo trava, Esc fecha e devolve o foco ao botão, e redimensionar para o desktop fecha a folha.
export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);

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
    const mq = window.matchMedia("(min-width: 960px)");
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

  const fecha = () => setOpen(false);

  return (
    <div className="min-[960px]:hidden">
      <button
        ref={botao}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="folha-menu"
        className="h-11 w-11 flex items-center justify-center rounded-[2px] text-tx transition-colors duration-100 ease-out hover:bg-acao-bg active:bg-acao-bg"
      >
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>

      {open && (
        // A folha desce do cabeçalho de onde foi puxada (Movimento 9 · abrir menu, globals.css).
        <nav
          id="folha-menu"
          aria-label="Menu"
          className="animate-menu-desce fixed inset-x-0 top-[76px] bottom-0 z-40 bg-sf-fundo overflow-y-auto overscroll-contain pt-2 pb-8"
        >
          <a href="#produto" className={item} onClick={fecha}>Produto</a>
          <a href="#seguranca" className={item} onClick={fecha}>Segurança e sigilo</a>
          <a href="#planos" className={item} onClick={fecha}>Planos</a>
          <a href="#perguntas" className={item} onClick={fecha}>Perguntas frequentes</a>
          <Link href="/blog" className={item} onClick={fecha}>Blog</Link>
          <a href="#contato" className={item} onClick={fecha}>Contato</a>
          <div className="grid gap-3 px-4 min-[640px]:px-8 pt-5">
            <ThemeToggle variant="capaSeg" />
            <Link
              href="/cadastro"
              onClick={fecha}
              className="inline-flex items-center justify-center min-h-[54px] px-7 bg-acao hover:bg-acao-hover text-acao-tx rounded-[2px] text-capa-corpo font-bold text-center transition-[background-color,transform] duration-100 ease-out active:translate-y-px"
            >
              Criar a conta do escritório
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
