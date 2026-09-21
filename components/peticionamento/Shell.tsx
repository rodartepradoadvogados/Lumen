"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// O "chassi" de três regiões do Hermes Agent Desktop (rail · tela · rodapé) — decisions.md §4,
// item 3: tradução da barra lateral para esta aba (a especificação não define navegação nenhuma
// aqui). "Sessões" fica visível e travada de propósito (fora do escopo desta entrega — decisions
// §9 item 3), para não fingir que existe uma tela atrás dela.
export type EtapaPeticionamento = "contexto" | "wizard" | "documentos" | "minuta";

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
  children,
}: {
  sessaoId: string;
  ativo: EtapaPeticionamento;
  crumbAtual: string;
  nomeUsuario: string;
  papelUsuario: string;
  statusDireita?: string;
  statusCentro?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="app-shell">
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
          <button className="rail-item disabled" title="Fora do escopo desta entrega — não existe tela de lista de sessões salvas ainda" disabled>
            <span className="lbl">Sessões</span>
          </button>
        </nav>
        <div className="rail-foot">
          <div className="who">{nomeUsuario}</div>
          <div className="role mono">{papelUsuario}</div>
        </div>
      </aside>

      <header className="topbar">
        <div className="crumbs">
          <button onClick={() => router.push("/painel")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, font: "inherit" }}>
            Lúmen
          </button>
          <span>/</span>
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
