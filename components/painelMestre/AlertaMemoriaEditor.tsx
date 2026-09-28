"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { salvarLimiarDeMemoriaHermes } from "@/lib/actions/campanhasPainelMestre";

// ============================================================================
// LIMIAR DE MEMÓRIA DA VPS DO HERMES (§4, item em aberto) — NÍVEL ÚNICO, mesmo padrão de "campo
// com salvar por linha" de PlanCatalogEditor/CampanhaPrecosEditor, para um valor só (não uma
// lista). Nasce nulo: enquanto nulo, lib/alertaMemoriaHermes.ts:situacaoDeMemoria NUNCA dispara —
// a tela deixa isso escrito por extenso antes de preencher.
// ============================================================================

export default function AlertaMemoriaEditor({
  limiarKBInicial,
  ultimoAlertaDiarioEm,
}: {
  limiarKBInicial: number | null;
  ultimoAlertaDiarioEm: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [texto, setTexto] = useState(limiarKBInicial != null ? String(limiarKBInicial) : "");
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function salvar() {
    setSalvo(false);
    setErro(null);
    const limiarKB = texto.trim() === "" ? null : Number(texto.trim());
    if (limiarKB != null && (!Number.isFinite(limiarKB) || limiarKB < 0)) {
      setErro("Digite um número de KB maior ou igual a zero, ou deixe em branco.");
      return;
    }
    startTransition(async () => {
      const r = await salvarLimiarDeMemoriaHermes(limiarKB);
      if (r.error) setErro(r.error);
      else setSalvo(true);
      router.refresh();
    });
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {limiarKBInicial == null && (
        <p className="text-xs font-semibold text-aviso">
          Sem limiar configurado — o alerta de memória está DESLIGADO até este número ser preenchido.
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-tx-2">Memória livre (RAM + swap) igual ou abaixo de</label>
        <input
          type="text"
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="sem limiar"
          className="w-32 border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs text-right"
        />
        <span className="text-sm text-tx-2">KB dispara o alerta para Jairo e Rodrigo</span>
        <button
          type="button"
          disabled={pending}
          onClick={salvar}
          className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50"
        >
          Salvar
        </button>
        {salvo && !pending && <Check size={14} className="text-concluido shrink-0" />}
      </div>
      {erro && <p className="text-xs text-urgente">{erro}</p>}
      <p className="text-xs text-tx-3">
        {ultimoAlertaDiarioEm ? `Último alerta disparado em ${ultimoAlertaDiarioEm}.` : "Nenhum alerta disparado ainda."}
      </p>
    </div>
  );
}
