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
  const [erro, setErro] = useState("");

  async function trocar(novo: string) {
    const anterior = valor;
    setValor(novo);
    setErro("");
    setSalvando(true);
    try {
      // A MESMA ação da Central do site (lib/actions/attendance.ts:setAttendanceStage): confere o
      // acesso e o dono, aplica a regra do motivo de perda e do follow-up. A rota PATCH .../stage
      // que este seletor usava tinha um vocabulário de fases próprio ("AGUARDANDO_RESPOSTA") que não
      // existe em lib/funil.ts — o card ia para uma coluna que o funil não desenha.
      const resultado = await setAttendanceStage(atendimentoId, novo);
      if (resultado?.error) {
        setValor(anterior);
        setErro(typeof resultado.error === "string" ? resultado.error : "Não foi possível mudar a fase.");
      } else router.refresh(); // o card muda de coluna
    } catch {
      setValor(anterior);
      setErro("Não foi possível mudar a fase. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <label className="flex min-h-11 items-center gap-2 rounded-atd-pilula bg-atd-pilula-2 pl-4 pr-2 text-app-meta font-semibold text-atd-previa">
        <span className="shrink-0">Fase</span>
        <select
          value={valor}
          disabled={salvando}
          onChange={(e) => trocar(e.target.value)}
          aria-label="Fase do atendimento"
          className="min-h-11 min-w-0 flex-1 rounded-atd-pilula bg-transparent py-1.5 pl-1 pr-2 text-right text-app-previa font-semibold text-tx disabled:opacity-60"
        >
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </label>
      {erro && (
        <p role="alert" className="mt-1.5 px-2 text-app-meta font-semibold text-urgente">
          {erro}
        </p>
      )}
    </div>
  );
}
