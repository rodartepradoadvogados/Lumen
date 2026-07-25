"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOffice } from "@/lib/actions/painelMestre";

const MODULE_OPTIONS: { key: "financeiro" | "whatsapp" | "atendimento" | "assessoria"; label: string }[] = [
  { key: "financeiro", label: "Financeiro" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "atendimento", label: "Atendimento" },
  { key: "assessoria", label: "Assessoria Jurídica" },
];

export default function NewOfficeForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState({ financeiro: true, whatsapp: false, atendimento: true, assessoria: false });

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createOffice({
      officeName: String(formData.get("officeName") || ""),
      adminName: String(formData.get("adminName") || ""),
      adminEmail: String(formData.get("adminEmail") || ""),
      billingEmail: String(formData.get("billingEmail") || ""),
      monthlyFee: Number(formData.get("monthlyFee") || 0),
      billingDueDay: Number(formData.get("billingDueDay") || 5),
      modules,
    });
    setLoading(false);
    if (result.error && !result.officeId) {
      setError(result.error);
      return;
    }
    router.push(result.officeId ? `/painel-mestre/${result.officeId}` : "/painel-mestre");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">Nome do escritório</label>
          <input name="officeName" required placeholder="Ex.: Andrade & Vasconcelos Advocacia" className="mt-1 w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">E-mail de cobrança</label>
          <input name="billingEmail" type="email" required placeholder="financeiro@escritorio.adv.br" className="mt-1 w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">Nome do administrador</label>
          <input name="adminName" required placeholder="Nome de quem vai logar" className="mt-1 w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">E-mail do administrador</label>
          <input name="adminEmail" type="email" required placeholder="recebe o convite pra definir senha" className="mt-1 w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">Mensalidade (R$)</label>
          <input name="monthlyFee" type="number" min={0} step="0.01" required defaultValue="890" className="mt-1 w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60">Dia de vencimento</label>
          <input name="billingDueDay" type="number" min={1} max={28} required defaultValue="5" className="mt-1 w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 mb-2 block">Módulos do plano</label>
        <div className="grid grid-cols-2 gap-2">
          {MODULE_OPTIONS.map((m) => (
            <label key={m.key} className="flex items-center gap-2 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm text-navy-800 dark:text-cream-50/85 cursor-pointer">
              <input
                type="checkbox"
                checked={modules[m.key]}
                onChange={(e) => setModules((prev) => ({ ...prev, [m.key]: e.target.checked }))}
                className="h-4 w-4 accent-gold-600"
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <button type="submit" disabled={loading} className="bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5">
        {loading ? "Criando..." : "Criar escritório e enviar convite"}
      </button>
    </form>
  );
}
