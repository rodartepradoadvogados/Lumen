"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarTriagemEGerar } from "@/lib/actions/peticionamento";

type Resumo = {
  contextoDescricao: string;
  materiaNome: string | null;
  /** TODAS as matérias marcadas, na ordem — a primeira é a principal (pedido do dono, 22/09/2026). */
  materias: string[];
  tipoPeca: string | null;
  tipoPecaOutro: string | null;
  fatos: string;
  pedidos: string[];
  documentos: string[];
  teses: string[];
};

export function ConfirmarClient({ sessaoId, resumo }: { sessaoId: string; resumo: Resumo }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await confirmarTriagemEGerar(sessaoId);
      if ("error" in resultado) {
        // Contexto grande demais tem tela própria (especificação §8) — os demais erros ficam
        // aqui mesmo, visíveis, nunca escondidos atrás de um redirecionamento silencioso.
        if (resultado.error.toLowerCase().includes("contexto") && resultado.error.toLowerCase().includes("exced")) {
          router.push(`/peticionamento/${sessaoId}/excedido`);
          return;
        }
        setErro(resultado.error);
        return;
      }
      router.push(`/peticionamento/${sessaoId}/minuta`);
    });
  }

  const linha = (rotulo: string, valor: React.ReactNode, corrigirHref: string) => (
    <div className="triage-row">
      <div className="k">{rotulo}</div>
      <div className="v">{valor}</div>
      <button className="edit" onClick={() => router.push(corrigirHref)}>
        Corrigir →
      </button>
    </div>
  );

  return (
    <div className="modal-triage" style={{ maxWidth: 760 }}>
      {erro && (
        <div className="callout callout-danger" style={{ marginBottom: 16 }}>
          {erro}
        </div>
      )}
      <p className="gate-note">O agente vai indicar a fonte de cada precedente citado e nunca decide sozinho a estratégia processual — só sugere; a decisão continua sendo sua.</p>
      <div className="triage-summary">
        {linha("Contexto", resumo.contextoDescricao, `/peticionamento/${sessaoId}/contexto`)}
        {linha(
          resumo.materias.length > 1 ? "Matérias" : "Matéria",
          resumo.materias.length ? (
            <div className="chips">
              {resumo.materias.map((m, i) => (
                <span className="chip" key={m} title={i === 0 ? "Matéria principal — define a estrutura da peça" : undefined}>
                  {i === 0 && resumo.materias.length > 1 ? `${m} (principal)` : m}
                </span>
              ))}
            </div>
          ) : (
            "(não escolhida)"
          ),
          `/peticionamento/${sessaoId}/contexto`,
        )}
        {linha("Tipo de peça", resumo.tipoPeca === "Outra" ? resumo.tipoPecaOutro || "Outra" : resumo.tipoPeca ?? "(o agente vai tentar inferir)", `/peticionamento/${sessaoId}/wizard`)}
        {linha("Fatos", resumo.fatos || "(vazio)", `/peticionamento/${sessaoId}/wizard`)}
        {linha(
          "Pedidos",
          <div className="chips">
            {resumo.pedidos.length ? resumo.pedidos.map((p) => <span className="chip" key={p}>{p}</span>) : "(nenhum)"}
          </div>,
          `/peticionamento/${sessaoId}/wizard`,
        )}
        {linha("Documentos", resumo.documentos.length ? resumo.documentos.join(", ") : "(nenhum)", `/peticionamento/${sessaoId}/documentos`)}
        {linha(
          "Teses",
          <div className="chips">{resumo.teses.length ? resumo.teses.map((t) => <span className="chip" key={t}>{t}</span>) : "(nenhuma)"}</div>,
          `/peticionamento/${sessaoId}/wizard`,
        )}
      </div>
      <div className="modal-actions-triage">
        <button className="btn btn-ghost" onClick={() => router.push(`/peticionamento/${sessaoId}/wizard`)}>
          Corrigir no questionário
        </button>
        <div className="right">
          <button className="btn btn-ghost" onClick={() => router.push(`/peticionamento/${sessaoId}/documentos`)}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={confirmar} disabled={pendente}>
            {pendente ? "Gerando…" : "Confirmar e gerar minuta"}
          </button>
        </div>
      </div>
    </div>
  );
}
