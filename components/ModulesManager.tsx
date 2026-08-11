"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateOfficeModules } from "@/lib/actions/officeModules";
import type { OfficeModules } from "@/lib/officeModules";

const MODULE_LABELS: { key: keyof OfficeModules; label: string; desc: string }[] = [
  { key: "financeiro", label: "Financeiro", desc: "Contas a pagar/receber, DRE, fluxo de caixa e livro caixa" },
  { key: "whatsapp", label: "WhatsApp", desc: "Conexão do número da Cloud API e recebimento de mensagens em Atendimento" },
  { key: "atendimento", label: "Atendimento (CRM)", desc: "Funil comercial, cadastro e triagem de atendimentos" },
  { key: "assessoria", label: "Assessoria Jurídica", desc: "Contratos de assessoria contínua, honorários e licitações" },
];

export default function ModulesManager({ modules }: { modules: OfficeModules }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(modules);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(key: keyof OfficeModules) {
    setError(null);
    setSaved(false);
    const next = { ...current, [key]: !current[key] };
    setCurrent(next);
    startTransition(async () => {
      const result = await updateOfficeModules(next);
      if (result.error) {
        setError(result.error);
        setCurrent(current);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-regua">
      {MODULE_LABELS.map(({ key, label, desc }) => (
        <div key={key} className="flex items-center gap-3 px-5 py-3.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-tx">{label}</p>
            <p className="text-xs text-tx-2">{desc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={current[key]}
            disabled={pending}
            onClick={() => toggle(key)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              current[key] ? "bg-emerald-600 dark:bg-emerald-500" : "bg-regua-forte"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                current[key] ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      ))}
      <div className="px-5 py-3 flex items-center gap-2">
        {error && <span className="text-[11px] text-urgente">{error}</span>}
        {saved && !pending && !error && (
          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]" title="Salvo">
            <Check size={14} /> Salvo
          </span>
        )}
      </div>
    </div>
  );
}
