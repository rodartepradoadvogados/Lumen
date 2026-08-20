"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateModulePrice, updatePlan } from "@/lib/actions/painelMestre";
import NullableMoneyInput from "@/components/painelMestre/NullableMoneyInput";

type ModulePriceRow = { moduleKey: string; label: string; price: number | null };

export function ModulePricesEditor({ modulePrices }: { modulePrices: ModulePriceRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, number | null>>(
    Object.fromEntries(modulePrices.map((m) => [m.moduleKey, m.price]))
  );
  const [savedKey, setSavedKey] = useState<string | null>(null);

  function save(moduleKey: string) {
    setSavedKey(null);
    startTransition(async () => {
      await updateModulePrice(moduleKey, values[moduleKey] ?? null);
      setSavedKey(moduleKey);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-white/10">
      {modulePrices.map((m) => (
        <div key={m.moduleKey} className="flex items-center gap-3 px-5 py-3.5">
          <span className="flex-1 text-sm text-white/85">{m.label}</span>
          <NullableMoneyInput
            value={values[m.moduleKey]}
            onChange={(v) => setValues((prev) => ({ ...prev, [m.moduleKey]: v }))}
            placeholder="sem preço"
            className="w-32 border border-white/15 bg-grafite-700 text-white px-2.5 py-1.5 text-xs text-right"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => save(m.moduleKey)}
            className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50 shrink-0"
          >
            Salvar
          </button>
          {savedKey === m.moduleKey && !pending && <Check size={14} className="text-concluido shrink-0" />}
        </div>
      ))}
    </div>
  );
}

type PlanRow = {
  id: string;
  name: string;
  maxOabs: number | null;
  maxProcessos: number | null;
  moduloFinanceiro: boolean;
  moduloWhatsapp: boolean;
  moduloAtendimento: boolean;
  moduloAssessoria: boolean;
};

const MODULE_FIELDS: { key: keyof Pick<PlanRow, "moduloFinanceiro" | "moduloWhatsapp" | "moduloAtendimento" | "moduloAssessoria">; label: string }[] = [
  { key: "moduloFinanceiro", label: "Financeiro" },
  { key: "moduloAssessoria", label: "Assessoria" },
  { key: "moduloWhatsapp", label: "WhatsApp" },
  { key: "moduloAtendimento", label: "Atendimento" },
];

export function PlansEditor({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Record<string, PlanRow>>(Object.fromEntries(plans.map((p) => [p.id, p])));
  const [savedId, setSavedId] = useState<string | null>(null);

  function update(id: string, patch: Partial<PlanRow>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function save(id: string) {
    setSavedId(null);
    const row = rows[id];
    startTransition(async () => {
      await updatePlan(id, {
        maxOabs: row.maxOabs,
        maxProcessos: row.maxProcessos,
        moduloFinanceiro: row.moduloFinanceiro,
        moduloWhatsapp: row.moduloWhatsapp,
        moduloAtendimento: row.moduloAtendimento,
        moduloAssessoria: row.moduloAssessoria,
      });
      setSavedId(id);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-white/10">
      {plans.map((p) => {
        const row = rows[p.id];
        return (
          <div key={p.id} className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">{p.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save(p.id)}
                  className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50"
                >
                  Salvar
                </button>
                {savedId === p.id && !pending && <Check size={14} className="text-concluido" />}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {MODULE_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 border border-white/15 px-3 py-2 text-sm text-white/85 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row[f.key]}
                    onChange={(e) => update(p.id, { [f.key]: e.target.checked } as Partial<PlanRow>)}
                    className="h-4 w-4 accent-marca"
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-white/50">Limite de OABs</label>
                <input
                  type="number"
                  min={0}
                  value={row.maxOabs ?? ""}
                  onChange={(e) => update(p.id, { maxOabs: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="sem limite"
                  className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/50">Limite de processos</label>
                <input
                  type="number"
                  min={0}
                  value={row.maxProcessos ?? ""}
                  onChange={(e) => update(p.id, { maxProcessos: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="sem limite"
                  className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
