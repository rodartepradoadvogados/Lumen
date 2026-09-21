"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarSessaoPeticionamento } from "@/lib/actions/peticionamento";

export function EntradaClient({ rascunhos }: { rascunhos: { id: string; atualizadoEm: string }[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function comecar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await criarSessaoPeticionamento();
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      router.push(`/peticionamento/${resultado.id}/contexto`);
    });
  }

  return (
    <div className="entry-cta">
      <div className="goal-field" style={{ display: "flex", alignItems: "center", gap: 12, height: 56, padding: "0 8px 0 20px", background: "var(--bg-1)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius)" }}>
        <input
          type="text"
          placeholder="Descreva o que precisa peticionar — ou comece escolhendo o contexto"
          style={{ flex: 1, height: "100%", border: 0, background: "transparent", color: "var(--tx-0)", fontFamily: "inherit", fontSize: 14.5, outline: "none" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") comecar();
          }}
        />
        <button
          className="btn btn-primary"
          onClick={comecar}
          disabled={pendente}
          aria-label="Começar"
          style={{ width: 40, height: 40, padding: 0, justifyContent: "center" }}
        >
          →
        </button>
      </div>
      {erro && (
        <div className="callout callout-danger" role="alert">
          {erro}
        </div>
      )}
      {rascunhos.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          {/* "Sessões" (listar/retomar um rascunho específico) é item fora do escopo desta
              entrega (decisions.md §9, item 3) — por isso este é um AVISO, não um botão que finge
              abrir algo que não existe. */}
          <span className="resume-pill" style={{ cursor: "default" }} title="A lista de sessões salvas (retomar um rascunho específico) é uma tela futura, fora do escopo desta entrega.">
            {rascunhos.length} rascunho(s) de contextualização salvo(s) automaticamente — retomar um específico ainda não tem tela própria
          </span>
        </div>
      )}
    </div>
  );
}
