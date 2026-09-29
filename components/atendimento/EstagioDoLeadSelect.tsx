"use client";

import { useState } from "react";

// Seletor de fase do card do funil no app de Atendimento. É Client Component porque o
// onChange não pode ser passado de dentro de um Server Component (app/atendimento-app/(shell)/
// funil/page.tsx) — isso derrubava a página inteira com "Application error: a server-side
// exception has occurred". Em caso de falha, volta ao valor anterior em vez de fingir que salvou.
export default function EstagioDoLeadSelect({
  atendimentoId,
  estagioAtual,
  opcoes,
}: {
  atendimentoId: string;
  estagioAtual: string;
  opcoes: { valor: string; rotulo: string }[];
}) {
  const [valor, setValor] = useState(estagioAtual);
  const [salvando, setSalvando] = useState(false);

  async function trocar(novo: string) {
    const anterior = valor;
    setValor(novo);
    setSalvando(true);
    try {
      const resposta = await fetch(`/api/atendimento/${atendimentoId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: novo }),
      });
      if (!resposta.ok) setValor(anterior);
    } catch {
      setValor(anterior);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <select
      value={valor}
      disabled={salvando}
      onChange={(e) => trocar(e.target.value)}
      aria-label="Fase do atendimento"
      className="w-full text-center text-corpo bg-sf border border-regua rounded-[2px] py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-ouro-acento disabled:opacity-60"
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}
