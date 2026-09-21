"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { salvarPrecoDoModuloDeCampanhas } from "@/lib/actions/campanhasPainelMestre";
import NullableMoneyInput from "@/components/painelMestre/NullableMoneyInput";

// ============================================================================
// PREÇOS DO MÓDULO DE CAMPANHAS (§2, item em aberto) — MESMO padrão de "campo de preço com salvar
// por linha" de components/painelMestre/PlanCatalogEditor.tsx:ModulePricesEditor, que este
// arquivo copia de propósito em vez de generalizar: são duas telas de catálogos diferentes
// (módulos do plano fixo vs. módulo de campanhas), e a casa já decidiu que abstrair cedo demais
// custa mais caro do que duas cópias pequenas e legíveis.
//
// AS DUAS LINHAS (MENSALIDADE_MODULO, SLOT_EXTRA) NASCEM NULAS — decisão do dono, não bug: até
// aqui, nenhum valor foi inventado. `preco: null` some como campo vazio (NullableMoneyInput),
// nunca "R$ 0,00" — que mentiria dizendo que o módulo é de graça.
// ============================================================================

export type PrecoDeModuloRow = { chave: string; label: string; preco: number | null };

export default function CampanhaPrecosEditor({ linhas }: { linhas: PrecoDeModuloRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, number | null>>(Object.fromEntries(linhas.map((l) => [l.chave, l.preco])));
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function save(chave: string) {
    setSavedKey(null);
    setErro(null);
    startTransition(async () => {
      const r = await salvarPrecoDoModuloDeCampanhas(chave, values[chave] ?? null);
      if (r.error) setErro(r.error);
      else setSavedKey(chave);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-regua">
      {erro && <p className="px-5 py-2 text-xs text-urgente">{erro}</p>}
      {linhas.map((l) => (
        <div key={l.chave} className="flex items-center gap-3 px-5 py-3.5">
          <span className="flex-1 text-sm text-tx-2">{l.label}</span>
          {values[l.chave] == null && (
            <span className="text-xs font-semibold text-aviso">sem preço configurado</span>
          )}
          <NullableMoneyInput
            value={values[l.chave]}
            onChange={(v) => setValues((prev) => ({ ...prev, [l.chave]: v }))}
            placeholder="sem preço"
            className="w-32 border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs text-right"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => save(l.chave)}
            className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50 shrink-0"
          >
            Salvar
          </button>
          {savedKey === l.chave && !pending && <Check size={14} className="text-concluido shrink-0" />}
        </div>
      ))}
    </div>
  );
}
