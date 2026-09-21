"use client";

// Pop-up "Como usar o módulo" — especificação §6. Só renderiza lib/peticionamentoTextosManual.ts —
// ver o comentário daquele módulo sobre a proibição de nome de skill/agente/modelo de IA/Hermes.

import { COMO_USAR_O_MODULO } from "@/lib/peticionamentoTextosManual";

export function ComoUsarModal({ aoFechar }: { aoFechar: () => void }) {
  const t = COMO_USAR_O_MODULO;
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="como-usar-titulo" onClick={aoFechar}>
      <div className="modal" style={{ width: "min(680px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mono quiet" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          {t.categoria}
        </div>
        <h2 id="como-usar-titulo" style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 24, marginBottom: 16 }}>
          {t.titulo}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginBottom: 18 }}>
          {t.passos.map((p, i) => (
            <div
              key={p.numero}
              style={{
                padding: "10px 11px",
                background: i === t.passos.length - 1 ? "var(--accent-bg)" : "var(--bg-2)",
                border: `1px solid ${i === t.passos.length - 1 ? "var(--accent-strong)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
                {p.numero}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--tx-0)" }}>{p.titulo}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--tx-2)" }}>{p.descricao}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
            O que você precisa fornecer
          </span>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--tx-1)", lineHeight: 1.6 }}>{t.oQueVoceForncece}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
          <div className="callout callout-danger" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              O que trava
            </span>
            {t.trava.map((linha) => (
              <span key={linha} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--tx-0)" }}>
                {linha}
              </span>
            ))}
          </div>
          <div className="callout callout-warn" style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              O que deixa arriscado
            </span>
            {t.arriscado.map((linha) => (
              <span key={linha} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--tx-0)" }}>
                {linha}
              </span>
            ))}
          </div>
        </div>

        <div className="callout" style={{ borderColor: "var(--ok-border)", background: "var(--ok-bg)", marginBottom: 18 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ok)" }}>
            O ideal
          </span>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--tx-1)", lineHeight: 1.6 }}>{t.ideal}</p>
        </div>

        <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={aoFechar}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
