"use client";

import Link from "next/link";
import { MenuPeticionamento } from "./MenuPeticionamento";
import { SincronizarTrabalhoEmAndamento } from "./SaidaContext";

// O "chassi" de três regiões do Hermes Agent Desktop (rail · tela · rodapé) — decisions.md §4,
// item 3: tradução da barra lateral para esta aba (a especificação não define navegação nenhuma
// aqui). ADEQUAÇÃO 21/09/2026: "Sessões" (aqui renomeado "Rascunhos", espec. §3) deixou de estar
// travado — agora tem tela própria (app/peticionamento/rascunhos/page.tsx); e o botão "Lúmen —
// Processos, Financeiro, Agenda…" da barra superior (espec. §2) virou o botão Menu.
export type EtapaPeticionamento = "tipo" | "contexto" | "wizard" | "documentos" | "confirmar" | "minuta";

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
        <MenuPeticionamento rascunhosCount={rascunhosCount} />
        <div className="crumbs">
          <span>Peticionamento</span>
          <span>/</span>
          <span className="now">{crumbAtual}</span>
        </div>
      </header>

      <main className="main">{children}</main>

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
