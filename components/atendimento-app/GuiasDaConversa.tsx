"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { guiaDaConversa } from "@/lib/navegacaoDoAtendimentoApp";

// As duas guias da conversa: Chat (principal) e Detalhes. São links de rota (cada guia é uma tela) com
// `aria-current`; a guia aberta leva o filete de ouro embaixo (a cor nunca fala sozinha: o rótulo e o
// peso da letra também mudam). Alvo de 44 px.
export default function GuiasDaConversa({ idDaConversa }: { idDaConversa: string }) {
  const pathname = usePathname() || "";
  const aberta = guiaDaConversa(pathname) ?? "chat";
  const guias = [
    { chave: "chat" as const, rotulo: "Chat", href: `/atendimento-app/${idDaConversa}` },
    { chave: "detalhes" as const, rotulo: "Detalhes", href: `/atendimento-app/${idDaConversa}/detalhes` },
  ];
  return (
    <nav aria-label="Seções da conversa" className="flex">
      {guias.map((g) => {
        const acesa = aberta === g.chave;
        return (
          <Link
            key={g.chave}
            href={g.href}
            replace={!acesa}
            aria-current={acesa ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center border-b-4 text-corpo ${
              acesa ? "border-ouro-acento font-bold text-atd-hdr-tx" : "border-transparent font-semibold text-atd-hdr-tx2 hover:text-atd-hdr-tx"
            }`}
          >
            {g.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
