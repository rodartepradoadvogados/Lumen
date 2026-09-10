"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const overlayLink = "block py-4 px-6 text-base font-semibold text-tx border-b border-regua";

// P1-1 do roteiro de adequação (.impeccable/plano-adequacao/roteiro-de-adequacao.md): abaixo do
// breakpoint `md`, o <nav> do cabeçalho (Produto/Preço/Blog) desaparecia sem nenhum substituto —
// este hambúrguer é o único jeito de alcançá-los em viewport mobile.
// "Entrar" fica de fora deste menu de propósito (ver comentário em app/page.tsx, seção do
// cabeçalho): precisa continuar visível sem toque extra — é o único jeito de logar de volta
// depois de um logout no PWA, e escondê-lo atrás do hambúrguer reintroduziria esse problema.
export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        className="h-11 w-11 flex items-center justify-center -mr-2 text-tx"
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-[76px] bottom-0 z-40 bg-sf overflow-y-auto">
          <a href="#recursos" className={overlayLink} onClick={() => setOpen(false)}>
            Produto
          </a>
          <a href="#preco" className={overlayLink} onClick={() => setOpen(false)}>
            Preço
          </a>
          <Link href="/blog" className={overlayLink} onClick={() => setOpen(false)}>
            Blog
          </Link>
        </div>
      )}
    </div>
  );
}
