"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Plus, Settings, Inbox, Columns3 } from "lucide-react";
import type { NivelDeAcesso } from "@/lib/acessoAtendimento";
import { abaAtiva, itensDaBarra, type ChaveDaAba } from "@/lib/navegacaoDoAtendimentoApp";

const ICONES: Record<ChaveDaAba, typeof Plus> = {
  conversas: MessageSquare,
  funil: Columns3,
  novo: Plus,
  triagem: Inbox,
  mais: Settings,
};

// A barra inferior: Conversas · Funil · "+" · Triagem · Mais (sem o Funil para quem só vê os próprios
// atendimentos; nenhuma para quem não tem acesso). Cada item tem 56 px de altura e a área inteira é
// o alvo; o "+" é o quadrado de ouro de 52 px. Safe area do aparelho respeitada embaixo.
export default function BarraInferior({ nivel }: { nivel: NivelDeAcesso }) {
  const pathname = usePathname() || "";
  const ativa = abaAtiva(pathname);
  const itens = itensDaBarra(nivel);
  if (itens.length === 0) return null;

  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-regua-forte bg-sf pb-[env(safe-area-inset-bottom)]" data-barra-inferior="">
      <ul className="mx-auto flex max-w-md items-stretch">
        {itens.map((item) => {
          const Icone = ICONES[item.chave];
          const acesa = ativa === item.chave;
          if (item.chave === "novo") {
            return (
              <li key={item.chave} className="flex flex-1 items-center justify-center">
                <Link href={item.href} className="flex min-h-14 flex-1 items-center justify-center">
                  <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[2px] bg-ouro-acento text-ouro-tx hover:bg-ouro-hover">
                    <Icone size={24} aria-hidden="true" />
                    <span className="sr-only">{item.rotulo}</span>
                  </span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.chave} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={acesa ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-etiqueta ${acesa ? "font-bold text-tx" : "font-semibold text-tx-2"}`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-[2px] ${acesa ? "bg-ouro-acento text-ouro-tx" : ""}`}>
                  <Icone size={20} aria-hidden="true" />
                </span>
                <span className="truncate">{item.rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
