"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Calendar, Plus, Briefcase } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import MobileNewEntitySheet from "@/components/mobile/MobileNewEntitySheet";
import MobileAssistente from "@/components/mobile/MobileAssistente";
import type { OfficeModules } from "@/lib/officeModules";

// Cinco abas fixas (documento 08 do handoff do redesenho — Fase 4, PWA): Publicações, Agenda,
// "+" central (Novo Atendimento), Processo e — desde 19/09/2026 — o Lúmen Agent, que tomou o
// lugar do Financeiro (ver a nota na lista abaixo).
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
  // ícone-circular+rótulo das outras quatro abas. Antes ia direto para Novo Atendimento; agora
  // abre o menu de escolha (components/mobile/MobileNewEntitySheet.tsx) — pedido do dono do
  // produto: "o botão de + tinha que dar a opção de escolher o que adicionar".
  { href: null, label: "", Icon: Plus, badge: null, central: true },
  { href: "/m/processos", label: "Processo", Icon: Briefcase, badge: null },
  // O LÚMEN AGENT ENTRA NO LUGAR DO FINANCEIRO (pedido do dono, 19/09/2026).
  //
  // A barra tem cinco lugares e todos estavam ocupados. O financeiro saiu daqui porque JÁ SE
  // CHEGA A ELE PELO MENU (/m/mais) — continua a um toque, só deixa de gastar um dos cinco
  // lugares fixos. O agente não tinha nenhum caminho no celular: a caixa flutuante do portal não
  // é montada neste layout, então no aplicativo ele simplesmente não existia.
  //
  // Bronze (--guia-ativa) e não bordô: bordô é a cor de AÇÃO da casa, e já está no "+" central
  // ao lado. Dois quadrados bordô na mesma barra disputariam a atenção um com o outro.
  { href: null, label: "Antonella", Icon: null, badge: null, agente: true },
];

export default function MobileBottomNav({
  agendaBadgeCount = 0,
  modules,
  userName = "",
}: {
  agendaBadgeCount?: number;
  modules: OfficeModules;
  userName?: string;
}) {
  const pathname = usePathname();
  const [newEntityOpen, setNewEntityOpen] = useState(false);
  const [assistenteOpen, setAssistenteOpen] = useState(false);

  return (
    <>
    <nav className="fixed bottom-0 inset-x-0 h-[76px] bg-sf border-t-2 border-regua-forte flex items-center z-40">
      {items.map(({ href, label, Icon, badge, central, agente }) => {
        const active = href !== null && (pathname === href || pathname.startsWith(`${href}/`));
        const badgeCount = badge === "agenda" ? agendaBadgeCount : 0;

        if (central) {
          return (
            <button
              key="central"
              type="button"
              onClick={() => setNewEntityOpen(true)}
              className="flex-1 flex items-center justify-center"
              aria-label="Novo"
            >
              <span className="h-[52px] w-[52px] bg-acao text-acao-tx rounded-[2px] flex items-center justify-center">
                <Icon size={24} />
              </span>
            </button>
          );
        }

        if (agente) {
          return (
            <button
              key="agente"
              type="button"
              onClick={() => setAssistenteOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              aria-label="Abrir a Antonella"
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-full border border-guia-ativa">
                {/* A lente sai em bordô dentro do círculo bronze: é o único ponto da barra onde
                    as duas cores da casa se encontram, e é o que faz o botão ser reconhecido
                    antes de a pessoa ler "Agent". */}
                <IconeAgente size={18} className="text-guia-ativa" acento="var(--acao)" />
              </span>
              <span className="text-corpo font-medium leading-none text-guia-ativa">{label}</span>
            </button>
          );
        }

        // O botão do agente é o único item sem ícone da biblioteca (ele tem desenho próprio), e
        // já saiu acima. Esta guarda existe para o compilador saber disso — e para uma aba nova
        // que alguém acrescente sem ícone falhar aqui, calada, em vez de derrubar a barra toda.
        if (!Icon) return null;

        return (
          <Link key={href} href={href as string} className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <span className="relative">
              <span className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${active ? "bg-marca" : ""}`}>
                {/* Emoji só quando esta aba tem pendência de verdade (mesma regra do sino do
                    cabeçalho, ver app/m/layout.tsx) — sem pendência, ícone de linha de sempre. */}
                {badge && badgeCount > 0 ? (
                  <span aria-hidden="true" className="text-destaque leading-none">📅</span>
                ) : (
                  <Icon size={19} className={active ? "text-marca-tx" : "text-tx-2"} />
                )}
              </span>
              {badge && badgeCount > 0 && (
                <span // Pastilha bordô (contagem não é risco) — 12px dentro de 20px. Antes eram 15px dentro
                  // de 18px, que não cabe, e a cor do texto vinha de uma classe inexistente.
                  className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-acao text-acao-tx text-etiqueta font-bold flex items-center justify-center tabular-nums">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span className={`text-corpo font-medium leading-none ${active ? "text-tx" : "text-tx-2"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
    <MobileNewEntitySheet open={newEntityOpen} onClose={() => setNewEntityOpen(false)} modules={modules} />
    <MobileAssistente aberto={assistenteOpen} aoFechar={() => setAssistenteOpen(false)} userName={userName} />
    </>
  );
}
