"use client";

// O BOTÃO MENU — especificação §2: substitui o antigo link "Lúmen — Processos, Financeiro,
// Agenda…" (que SAÍA da aba) em toda a barra superior do módulo, tanto na tela inicial quanto
// dentro de uma sessão (components/peticionamento/Shell.tsx). Cinco itens, na ordem da §2: Nova
// peça · Ver rascunhos · Orientações gerais · Como usar o módulo · (separador) Sair do
// peticionamento.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarSessaoPeticionamento } from "@/lib/actions/peticionamento";
import { useSaidaDoPeticionamento, tentarFecharJanela } from "./SaidaContext";
import { OrientacoesModal } from "./OrientacoesModal";
import { ComoUsarModal } from "./ComoUsarModal";

export function MenuPeticionamento({ rascunhosCount }: { rascunhosCount?: number }) {
  const router = useRouter();
  const { pedirSaida } = useSaidaDoPeticionamento();
  const [aberto, setAberto] = useState(false);
  const [orientacoesAberto, setOrientacoesAberto] = useState(false);
  const [comoUsarAberto, setComoUsarAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function novaPeca() {
    setAberto(false);
    iniciar(async () => {
      const resultado = await criarSessaoPeticionamento();
      if ("id" in resultado) router.push(`/peticionamento/${resultado.id}/tipo`);
    });
  }

  function sairDoPeticionamento() {
    setAberto(false);
    pedirSaida(() => tentarFecharJanela(() => router.push("/peticionamento")));
  }

  const itemEstilo: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "block",
    padding: "9px 12px",
    borderRadius: "var(--radius)",
    color: "var(--tx-0)",
    fontSize: 13,
    fontFamily: "inherit",
    textDecoration: "none",
  };

  return (
    <div ref={raiz} style={{ position: "relative" }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setAberto((a) => !a)} aria-haspopup="menu" aria-expanded={aberto}>
        Menu <span aria-hidden="true">▾</span>
      </button>

      {aberto && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            minWidth: 250,
            background: "var(--bg-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-modal)",
            zIndex: 60,
            padding: 6,
          }}
        >
          <button role="menuitem" style={itemEstilo} disabled={pendente} onClick={novaPeca} onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-3)")} onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}>
            Nova peça
          </button>
          <Link role="menuitem" href="/peticionamento/rascunhos" style={itemEstilo} onClick={() => setAberto(false)}>
            Ver rascunhos{typeof rascunhosCount === "number" ? ` (${rascunhosCount})` : ""}
          </Link>
          <button role="menuitem" style={itemEstilo} onClick={() => { setAberto(false); setOrientacoesAberto(true); }}>
            Orientações gerais
          </button>
          <button role="menuitem" style={itemEstilo} onClick={() => { setAberto(false); setComoUsarAberto(true); }}>
            Como usar o módulo
          </button>
          <div style={{ borderTop: "1px solid var(--border)", margin: "6px 4px" }} />
          <button role="menuitem" style={{ ...itemEstilo, color: "var(--danger-tx)" }} onClick={sairDoPeticionamento}>
            Sair do peticionamento
          </button>
        </div>
      )}

      {orientacoesAberto && <OrientacoesModal aoFechar={() => setOrientacoesAberto(false)} />}
      {comoUsarAberto && <ComoUsarModal aoFechar={() => setComoUsarAberto(false)} />}
    </div>
  );
}
