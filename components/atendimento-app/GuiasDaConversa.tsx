"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { guiaDaConversa } from "@/lib/navegacaoDoAtendimentoApp";

// As duas guias da conversa: Chat (principal) e Detalhes. São links de rota (cada guia é uma tela), expostos
// como `tablist`: setas, Home e End trocam de guia, só a guia aberta entra na ordem do Tab, e `aria-controls`
// aponta para o painel (`PainelDaConversa`, no layout). A guia aberta leva o filete de ouro embaixo (a cor
// nunca fala sozinha: o rótulo e o peso da letra também mudam). Alvo de 44 px.
export default function GuiasDaConversa({ idDaConversa }: { idDaConversa: string }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const aberta = guiaDaConversa(pathname) ?? "chat";
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const guias = [
    { chave: "chat" as const, rotulo: "Chat", href: `/atendimento-app/${idDaConversa}` },
    { chave: "detalhes" as const, rotulo: "Detalhes", href: `/atendimento-app/${idDaConversa}/detalhes` },
  ];

  function aoTeclar(e: React.KeyboardEvent, i: number) {
    const ir = e.key === "ArrowRight" ? (i + 1) % guias.length : e.key === "ArrowLeft" ? (i - 1 + guias.length) % guias.length : e.key === "Home" ? 0 : e.key === "End" ? guias.length - 1 : -1;
    if (ir < 0) return;
    e.preventDefault();
    refs.current[guias[ir].chave]?.focus();
    if (guias[ir].chave !== aberta) router.replace(guias[ir].href);
  }

  return (
    <div role="tablist" aria-label="Seções da conversa" data-oculta-com-teclado="" className="flex">
      {guias.map((g, i) => {
        const acesa = aberta === g.chave;
        return (
          <Link
            key={g.chave}
            ref={(el) => {
              refs.current[g.chave] = el;
            }}
            id={`guia-${g.chave}`}
            role="tab"
            aria-selected={acesa}
            aria-controls="painel-da-conversa"
            tabIndex={acesa ? 0 : -1}
            href={g.href}
            replace={!acesa}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={`flex min-h-11 flex-1 items-center justify-center border-b-4 text-corpo ${
              acesa ? "border-ouro-acento font-bold text-atd-hdr-tx" : "border-transparent font-semibold text-atd-hdr-tx2 hover:text-atd-hdr-tx"
            }`}
          >
            {g.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
