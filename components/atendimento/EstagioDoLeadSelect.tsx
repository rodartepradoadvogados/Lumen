"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAttendanceStage } from "@/lib/actions/attendance";

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
  const router = useRouter();
  const [valor, setValor] = useState(estagioAtual);
  const [salvando, setSalvando] = useState(false);

  async function trocar(novo: string) {
    const anterior = valor;
    setValor(novo);
    setSalvando(true);
    try {
      // A MESMA ação da Central do site (lib/actions/attendance.ts:setAttendanceStage): confere o
      // acesso e o dono, aplica a regra do motivo de perda e do follow-up. A rota PATCH .../stage
      // que este seletor usava tinha um vocabulário de fases próprio ("AGUARDANDO_RESPOSTA") que não
      // existe em lib/funil.ts — o card ia para uma coluna que o funil não desenha.
      const resultado = await setAttendanceStage(atendimentoId, novo);
      if (resultado?.error) setValor(anterior);
      else router.refresh(); // o card muda de coluna
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
      className="w-full text-center text-corpo bg-sf border border-regua rounded-[2px] min-h-11 py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-ouro-acento disabled:opacity-60"
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}
