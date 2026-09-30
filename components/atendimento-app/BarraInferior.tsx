"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Settings, Inbox, Columns3 } from "lucide-react";
import type { NivelDeAcesso } from "@/lib/acessoAtendimento";
import { abaAtiva, itensDaBarra, type ChaveDaAba } from "@/lib/navegacaoDoAtendimentoApp";
import SeloContagem from "@/components/atendimento-app/ui/SeloContagem";

const ICONES: Record<ChaveDaAba, typeof Settings> = {
  conversas: MessageSquare,
  funil: Columns3,
  novo: MessageSquare,
  triagem: Inbox,
  mais: Settings,
};

/** Contagem por alvo da barra (selo sobre o ícone). Vazio = sem selo. Hoje nenhuma tela alimenta isto: é o ponto de extensão. */
export type ContagensDaBarra = Partial<Record<ChaveDaAba, number>>;

// A barra inferior (acabamento WhatsApp): QUATRO alvos — Conversas · Funil · Triagem · Mais — com ícone e
// rótulo. O alvo ativo ganha uma PÍLULA suave (ouro 18%) atrás do ícone e o rótulo em negrito. Quem só vê os
// próprios atendimentos não tem o Funil; quem não tem acesso não tem barra. A "nova conversa" NÃO está aqui:
// é o botão flutuante (BotaoFlutuante, montado pela casca). Cada alvo tem 56 px de altura; safe area respeitada.
export default function BarraInferior({ nivel, contagens = {} }: { nivel: NivelDeAcesso; contagens?: ContagensDaBarra }) {
  const pathname = usePathname() || "";
  const ativa = abaAtiva(pathname);
  const itens = itensDaBarra(nivel);
  if (itens.length === 0) return null;

  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-atd-barra-borda bg-atd-tela pb-[env(safe-area-inset-bottom)]" data-barra-inferior="">
      <ul className="mx-auto flex max-w-md items-stretch px-2">
        {itens.map((item) => {
          const Icone = ICONES[item.chave];
          const acesa = ativa === item.chave;
          const n = contagens[item.chave];
          return (
            <li key={item.chave} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={acesa ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-etiqueta ${acesa ? "font-bold text-tx" : "font-medium text-atd-previa"}`}
              >
                <span data-pilula-da-aba={acesa ? "ativa" : ""} className={`relative flex h-8 w-[60px] items-center justify-center rounded-atd-pilula ${acesa ? "bg-atd-ouro-suave text-atd-texto-ouro" : ""}`}>
                  <Icone size={22} aria-hidden="true" />
                  {n !== undefined && n > 0 && <SeloContagem valor={n} rotulo="para ver" sobreIcone />}
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
