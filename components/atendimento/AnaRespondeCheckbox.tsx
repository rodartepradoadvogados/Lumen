"use client";

import { useState } from "react";

// Caixa "Ana responde nesta conversa" do detalhe do atendimento no app de Atendimento. Client
// Component pelo mesmo motivo de EstagioDoLeadSelect: o onChange não pode nascer num Server
// Component (app/atendimento-app/(shell)/[id]/page.tsx). Volta ao valor anterior se salvar falhar.
export default function AnaRespondeCheckbox({
  atendimentoId,
  inicial,
}: {
  atendimentoId: string;
  inicial: boolean;
}) {
  const [marcado, setMarcado] = useState(inicial);
  const [salvando, setSalvando] = useState(false);

  async function trocar(novo: boolean) {
    const anterior = marcado;
    setMarcado(novo);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/atendimento/${atendimentoId}/ana-responde`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anaResponde: novo }),
      });
      if (!resposta.ok) setMarcado(anterior);
    } catch {
      setMarcado(anterior);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={marcado}
        disabled={salvando}
        onChange={(e) => trocar(e.target.checked)}
        className="h-4 w-4 rounded border-regua-forte focus:ring-ouro-acento text-ouro-acento"
      />
      <span className="text-corpo font-medium text-tx">Ana responde nesta conversa</span>
    </label>
  );
}
