"use client";

// Pop-up "Orientações gerais" — especificação §5. Só renderiza lib/peticionamentoTextosManual.ts;
// NUNCA escreva texto novo aqui — ver o comentário daquele módulo sobre a proibição de nome de
// skill/agente/modelo de IA/Hermes e por que o texto mora num módulo de dados só, testável.

import { ORIENTACOES_GERAIS } from "@/lib/peticionamentoTextosManual";

export function OrientacoesModal({ aoFechar }: { aoFechar: () => void }) {
  const t = ORIENTACOES_GERAIS;
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="orientacoes-titulo" onClick={aoFechar}>
      <div className="modal" style={{ width: "min(620px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mono quiet" style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          {t.categoria}
        </div>
        <h2 id="orientacoes-titulo" style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 24 }}>
          {t.titulo}
        </h2>
        <p className="lede">
          <strong style={{ color: "var(--tx-0)" }}>{t.abertura}</strong>
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
            O que ele faz
          </span>
          <p style={{ margin: 0, fontSize: 13, color: "var(--tx-1)", lineHeight: 1.65 }}>{t.oQueFaz}</p>
        </div>

        <div className="callout callout-danger" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            O que ele nunca faz
          </span>
          {t.oQueNuncaFaz.map((linha) => (
            <span key={linha} style={{ fontSize: 13, lineHeight: 1.55, color: "var(--tx-0)" }}>
              {linha}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
            A conduta dele
          </span>
          <p style={{ margin: 0, fontSize: 13, color: "var(--tx-1)", lineHeight: 1.65 }}>{t.conduta}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
            O que continua sendo seu
          </span>
          <p style={{ margin: 0, fontSize: 13, color: "var(--tx-1)", lineHeight: 1.65 }}>{t.oQueContinuaSendoSeu}</p>
        </div>

        <div className="callout" style={{ marginBottom: 18 }}>
          <p className="mono" style={{ margin: 0, fontSize: 12, color: "var(--tx-2)", lineHeight: 1.6 }}>
            {t.rodape}
          </p>
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
