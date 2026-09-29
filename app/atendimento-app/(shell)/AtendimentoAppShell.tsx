"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import type { NivelDeAcesso } from "@/lib/acessoAtendimento";
import { ehTelaCheia } from "@/lib/navegacaoDoAtendimentoApp";
import { SCRIPT_INICIAL_DO_TEMA } from "@/lib/temaDoAtendimentoApp";
import BarraInferior from "@/components/atendimento-app/BarraInferior";
import CabecalhoDoApp from "@/components/atendimento-app/CabecalhoDoApp";
import SeguidorDeNavegacao from "@/components/atendimento-app/SeguidorDeNavegacao";

const SCRIPT_DO_SERVICE_WORKER = `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw-atendimento.js', {scope: '/atendimento-app'}).catch(function(){}); }`;

// A CASCA DO APLICATIVO DE ATENDIMENTO.
//
// Telas de aba (Conversas, Funil, Triagem, Mais): cabeçalho grafite + conteúdo + barra inferior.
// Telas cheias (a conversa, seus Detalhes e o "+" Novo atendimento): SEM cabeçalho e SEM barra — a
// conversa é a tela. A decisão é `ehTelaCheia(pathname)` (lib/navegacaoDoAtendimentoApp.ts).
//
// O script do tema fica DENTRO da caixa, logo depois da abertura dela: é o único ponto em que ele
// enxerga o elemento antes da primeira pintura (antes, ficava fora e não achava a caixa — a tela
// piscava em Dia antes de virar Noite).
export default function AtendimentoAppShell({ officeName, nivel, children }: { officeName?: string; nivel: NivelDeAcesso; children: ReactNode }) {
  const pathname = usePathname() || "";
  const cheia = ehTelaCheia(pathname);

  return (
    <div id="atendimento-shell" className="atendimento-shell min-h-dvh bg-sf-fundo text-tx transition-colors">
      {/* eslint-disable-next-line react/no-danger -- texto fixo do próprio código (lib/temaDoAtendimentoApp.ts), sem dado de usuário */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_INICIAL_DO_TEMA }} />
      {/* eslint-disable-next-line react/no-danger -- texto fixo do próprio código */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_DO_SERVICE_WORKER }} />
      <SeguidorDeNavegacao />
      {cheia ? (
        children
      ) : (
        <>
          <CabecalhoDoApp officeName={officeName} />
          <main className="mx-auto min-h-[calc(100dvh-4rem)] max-w-md pb-24">{children}</main>
          <BarraInferior nivel={nivel} />
          <InstallPrompt app="atendimento" nome="Lúmen Atendimento" />
        </>
      )}
    </div>
  );
}
