"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Calendar, Plus, Briefcase, DollarSign } from "lucide-react";

// Cinco abas fixas (documento 08 do handoff do redesenho — Fase 4, PWA): Publicações, Agenda,
// "+" central (Novo Atendimento), Processo, Financeiro (resumo) — substitui as cinco antigas
// (Início/Agenda/Alertas/Publicações/Menu).
//
// Início e Menu (Mais) NÃO desaparecem — nada se perde, só saem do destaque da barra fixa (troca
// de escopo pedida pelo dono do projeto: seguir as 5 abas do documento, mas sem tirar acesso a
// nada que a equipe já usa). Os dois continuam a 1 toque, só que pelo CABEÇALHO em vez da barra
// (ver app/m/layout.tsx): a logomarca já levava pra /m (Início) e continua levando; o ícone de
// avatar novo no cabeçalho leva pra /m/mais (Menu). Alertas idem — sai da barra (só tinha um
// caminho redundante aqui, o sino do cabeçalho já existia e continua existindo).
//
// Alvo de toque mínimo 44px (documento 08): cada aba é um <Link> "flex-1" dentro de uma barra de
// 76px, então a área tocável de cada uma é ~76px de altura por 1/5 da largura da tela — bem acima
// do mínimo, mesmo que o ícone visual dentro seja menor.
const items = [
  { href: "/m/publicacoes", label: "Publ.", Icon: Newspaper, badge: null },
  { href: "/m/agenda", label: "Agenda", Icon: Calendar, badge: "agenda" as const },
  // Central — tratamento visual próprio (quadrado 52px em --acao), não faz parte do padrão
  // ícone-circular+rótulo das outras quatro abas.
  { href: "/m/atendimento/novo", label: "", Icon: Plus, badge: null, central: true },
  { href: "/m/processos", label: "Processo", Icon: Briefcase, badge: null },
  { href: "/m/financeiro", label: "R$", Icon: DollarSign, badge: null },
];

export default function MobileBottomNav({ todayAgendaCount = 0 }: { todayAgendaCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 h-[76px] bg-sf border-t-2 border-regua-forte flex items-center z-40">
      {items.map(({ href, label, Icon, badge, central }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badgeCount = badge === "agenda" ? todayAgendaCount : 0;

        if (central) {
          return (
            <Link key={href} href={href} className="flex-1 flex items-center justify-center" aria-label="Novo atendimento">
              <span className="h-[52px] w-[52px] bg-acao text-acao-tx flex items-center justify-center">
                <Icon size={24} />
              </span>
            </Link>
          );
        }

        return (
          <Link key={href} href={href} className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <span className="relative">
              <span className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${active ? "bg-marca" : ""}`}>
                <Icon size={19} className={active ? "text-marca-tx" : "text-tx-2"} />
              </span>
              {badge && badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-atencao text-white text-[10px] font-bold flex items-center justify-center">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span className={`text-[10px] font-medium leading-none ${active ? "text-tx" : "text-tx-2"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
