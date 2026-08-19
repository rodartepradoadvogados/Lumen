"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarPreferenciaComunicados } from "@/lib/actions/comunicados";
import {
  BREAKTHROUGH_EVENTOS,
  PER_EVENT_EVENTOS,
  CANAIS,
  CADENCIAS,
  type ComunicadoPreferencia,
  type BreakthroughEvento,
  type PerEventEvento,
  type Canal,
  type Cadencia,
} from "@/lib/comunicadosEventos";
import { Check } from "lucide-react";

const CANAL_LABEL: Record<Canal, string> = { EMAIL: "e-mail", PUSH: "push", IN_APP: "in-app" };
const CADENCIA_LABEL: Record<Cadencia, string> = { NA_HORA: "na hora", DIARIO: "diário", SEMANAL: "semanal", NUNCA: "nunca" };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Documento 06 (Fase 3 — Comunicados). Bloco 1 (resumo diário) + Bloco 2 (exceção que fura a
// fila) + Bloco 3 (canal/cadência por evento) — a coluna "regras" de 640px do documento. O
// editor de template (coluna do lado, com prévia ao vivo) é a próxima PR desta fase.
export default function ComunicadosForm({ initial }: { initial: ComunicadoPreferencia }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggleBreakthrough(key: BreakthroughEvento) {
    setSaved(false);
    setState((s) => ({
      ...s,
      breakthrough: s.breakthrough.includes(key) ? s.breakthrough.filter((b) => b !== key) : [...s.breakthrough, key],
    }));
  }

  function setPerEvent(key: PerEventEvento, patch: Partial<{ canal: Canal; cadencia: Cadencia }>) {
    setSaved(false);
    setState((s) => ({ ...s, perEvent: { ...s.perEvent, [key]: { ...s.perEvent[key], ...patch } } }));
  }

  function salvar() {
    setError("");
    startTransition(async () => {
      const result = await salvarPreferenciaComunicados(state);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Bloco 1 — Resumo diário */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={state.digestOn}
            onClick={() => {
              setSaved(false);
              setState((s) => ({ ...s, digestOn: !s.digestOn }));
            }}
            className={`relative h-7 w-[52px] shrink-0 transition-colors ${state.digestOn ? "bg-acao" : "bg-regua-forte"}`}
          >
            <span
              className={`absolute top-[3px] h-[22px] w-[22px] bg-white transition-transform ${state.digestOn ? "translate-x-[27px]" : "translate-x-[3px]"}`}
            />
          </button>
          <p className="text-sm font-semibold text-tx">Resumo diário {state.digestOn ? "ativo" : "inativo"}</p>
        </div>

        <div className={`flex items-center gap-3 flex-wrap ${state.digestOn ? "" : "opacity-40 pointer-events-none"}`}>
          <label className="text-xs font-medium text-tx-2">
            Horário
            <input
              type="number"
              min={0}
              max={23}
              value={state.digestHour}
              onChange={(e) => {
                setSaved(false);
                setState((s) => ({ ...s, digestHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) }));
              }}
              className="block w-[92px] mt-1 border border-regua bg-sf text-tx px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <p className="text-xs text-tx-3 mt-4">{pad2(state.digestHour)}:00</p>
          <div className="flex gap-1 mt-4">
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setState((s) => ({ ...s, weekdaysOnly: true }));
              }}
              className={`text-xs font-semibold px-3 py-1.5 ${state.weekdaysOnly ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2"}`}
            >
              dias úteis
            </button>
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setState((s) => ({ ...s, weekdaysOnly: false }));
              }}
              className={`text-xs font-semibold px-3 py-1.5 ${!state.weekdaysOnly ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2"}`}
            >
              todos os dias
            </button>
          </div>
        </div>
        <p className="text-xs text-tx-3">Um e-mail e um push por dia, com tudo que aconteceu desde o último. Nada é enviado duas vezes.</p>
      </div>

      {/* Bloco 2 — Exceção: fura a fila */}
      <div className="bg-sf-apoio border-l-4 border-atencao p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-atencao">Exceção — fura a fila</p>
        <div className="space-y-1.5">
          {(Object.keys(BREAKTHROUGH_EVENTOS) as BreakthroughEvento[]).map((key) => {
            const checked = state.breakthrough.includes(key);
            return (
              <label key={key} className="flex items-center gap-2.5 text-sm text-tx cursor-pointer">
                <span
                  onClick={() => toggleBreakthrough(key)}
                  className={`h-4 w-4 shrink-0 border flex items-center justify-center ${checked ? "bg-atencao border-atencao" : "border-regua-forte bg-sf"}`}
                >
                  {checked && <Check size={11} className="text-white" />}
                </span>
                {BREAKTHROUGH_EVENTOS[key]}
              </label>
            );
          })}
        </div>
        <p className="text-[11px] text-tx-3">Manter a lista curta é parte do desenho — se tudo pode furar a fila, não existe fila.</p>
      </div>

      {/* Bloco 3 — Por evento: canal e cadência */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-tx">Por evento</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-tx-3 border-b border-regua">
                <th className="py-2 pr-3 font-semibold">Evento</th>
                <th className="py-2 pr-3 font-semibold">Canal</th>
                <th className="py-2 font-semibold">Cadência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {(Object.keys(PER_EVENT_EVENTOS) as PerEventEvento[]).map((key) => (
                <tr key={key}>
                  <td className="py-2 pr-3 text-tx">{PER_EVENT_EVENTOS[key]}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={state.perEvent[key].canal}
                      onChange={(e) => setPerEvent(key, { canal: e.target.value as Canal })}
                      className="border border-regua bg-sf text-tx text-xs px-2 py-1.5"
                    >
                      {CANAIS.map((c) => (
                        <option key={c} value={c}>{CANAL_LABEL[c]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <select
                      value={state.perEvent[key].cadencia}
                      onChange={(e) => setPerEvent(key, { cadencia: e.target.value as Cadencia })}
                      className="border border-regua bg-sf text-tx text-xs px-2 py-1.5"
                    >
                      {CADENCIAS.map((c) => (
                        <option key={c} value={c}>{CADENCIA_LABEL[c]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-atencao">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={salvar}
          className="bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {saved && !pending && <span className="text-xs font-semibold text-concluido">Salvo.</span>}
      </div>
    </div>
  );
}
