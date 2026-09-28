"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MenuPeticionamento } from "./MenuPeticionamento";
import { AlternadorDeTema } from "./AlternadorDeTema";
import { SincronizarTrabalhoEmAndamento } from "./SaidaContext";
import { hrefEtapaAnterior, type EtapaPeticionamento } from "@/lib/peticionamentoNavegacao";

// O "chassi" de três regiões do Hermes Agent Desktop (rail · tela · rodapé) — decisions.md §4,
// item 3: tradução da barra lateral para esta aba (a especificação não define navegação nenhuma
// aqui). ADEQUAÇÃO 21/09/2026: "Sessões" (aqui renomeado "Rascunhos", espec. §3) deixou de estar
// travado — agora tem tela própria (app/peticionamento/rascunhos/page.tsx); e o botão "Lúmen —
// Processos, Financeiro, Agenda…" da barra superior (espec. §2) virou o botão Menu.
//
// EtapaPeticionamento e a ordem das etapas (hrefEtapaAnterior, para o botão "Voltar" abaixo)
// moraram aqui até 24/09/2026 — mudaram para lib/peticionamentoNavegacao.ts só para
// hrefEtapaAnterior poder ser testada direto (lib/testes/peticionamentoNavegacao.teste.ts), sem
// montar este componente. Reexportado abaixo porque nada mais neste arquivo muda.
export type { EtapaPeticionamento };

const ITENS: { chave: EtapaPeticionamento; label: string; href: (id: string) => string }[] = [
  { chave: "contexto", label: "Contexto", href: (id) => `/peticionamento/${id}/contexto` },
  { chave: "wizard", label: "Questionário", href: (id) => `/peticionamento/${id}/wizard` },
  { chave: "documentos", label: "Documentos", href: (id) => `/peticionamento/${id}/documentos` },
  { chave: "minuta", label: "Minuta", href: (id) => `/peticionamento/${id}/minuta` },
];

export function ShellPeticionamento({
  sessaoId,
  ativo,
  crumbAtual,
  nomeUsuario,
  papelUsuario,
  statusDireita,
  statusCentro,
  rascunhosCount,
  temTrabalho,
  rolagemSoNoMiolo,
  children,
}: {
  sessaoId: string;
  ativo: EtapaPeticionamento;
  crumbAtual: string;
  nomeUsuario: string;
  papelUsuario: string;
  statusDireita?: string;
  statusCentro?: string;
  rascunhosCount?: number;
  /** Espec. §4: "numa sessão vazia, sair é sair" — computado no servidor por
      lib/peticionamentoPasso.ts:sessaoTemTrabalhoEmAndamento e sincronizado com o Provider de
      saída (components/peticionamento/SaidaContext.tsx) montado no layout. */
  temTrabalho: boolean;
  /**
   * PEDIDO DO DONO, 22/09/2026 (item 5): "a barra de Cliente confirmado […] precisa ficar
   * congelada, bem como o menu à esquerda e a parte de cima, ou seja, a rolagem só deve afetar às
   * demandas filtradas". Com isto ligado, `.main` para de rolar e passa a ser uma caixa fixa —
   * quem rola é a região que a própria página marcar (.ctx-rolagem). Sem isto, a página rola
   * inteira dentro de `.main`, como antes.
   */
  rolagemSoNoMiolo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <SincronizarTrabalhoEmAndamento temTrabalho={temTrabalho} />
      <aside className="rail">
        <div className="rail-brand">
          <span>Lúmen</span>
        </div>
        <nav>
          {ITENS.map((item) => (
            <Link key={item.chave} className={`rail-item${item.chave === ativo ? " active" : ""}`} href={item.href(sessaoId)}>
              <span className="lbl">{item.label}</span>
            </Link>
          ))}
          <Link className="rail-item" href="/peticionamento/rascunhos">
            <span className="lbl">Rascunhos</span>
          </Link>
        </nav>
        <div className="rail-foot">
          <div className="who">{nomeUsuario}</div>
          <div className="role mono">{papelUsuario}</div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-left">
          <MenuPeticionamento rascunhosCount={rascunhosCount} />
          {/* "VOLTAR" — pedido do dono, 24/09/2026 (item 2): "hoje, o botão de voltar só existe
              no questionário" (lá, é um passo INTERNO do wizard, não uma volta de página — ver
              WizardClient.tsx). Rota fixa por etapa (hrefEtapaAnterior,
              lib/peticionamentoNavegacao.ts), não `router.back()`: o rail permite pular direto de
              uma etapa a outra fora de ordem, e um "Voltar" por histórico do navegador voltaria
              para onde quer que a pessoa estivesse antes — nem sempre a etapa anterior de VERDADE
              desta sessão. */}
          <Link className="btn btn-ghost btn-sm" href={hrefEtapaAnterior(ativo, sessaoId)} aria-label="Voltar à etapa anterior">
            <ChevronLeft size={14} aria-hidden="true" />
            Voltar
          </Link>
          <div className="crumbs">
            <span>Peticionamento</span>
            <span>/</span>
            <span className="now">{crumbAtual}</span>
          </div>
        </div>
        {/* Alternador de tema — pedido do dono, 24/09/2026 (item 3): "sumiu do peticionamento".
            Ver components/peticionamento/AlternadorDeTema.tsx para a causa (esta aba nunca
            renderizou o TopBar/TeamMonitorPanel do resto do produto, onde o alternador do portal
            mora) e lib/peticionamentoTheme.ts para o mecanismo (próprio desta aba). */}
        <AlternadorDeTema />
      </header>

      <main className={`main${rolagemSoNoMiolo ? " main-fixa" : ""}`}>{children}</main>

      <footer className="statusbar">
        <div>
          <span className="dot" />
          <span>Rodarte Prado Advogados</span>
        </div>
        <div className="quiet">{statusCentro ?? `sessão ${sessaoId.slice(0, 8)}`}</div>
        <div>{statusDireita ?? "perfil peticionamento-lumen"}</div>
      </footer>
    </div>
  );
}
