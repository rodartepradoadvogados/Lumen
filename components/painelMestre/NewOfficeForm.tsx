"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOffice } from "@/lib/actions/painelMestre";
import MoneyInput from "@/components/MoneyInput";

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
      {error && <p className="text-xs text-atencao bg-atencao/10 dark:bg-atencao/15 px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-white/60">Nome do escritório</label>
          <input name="officeName" required placeholder="Ex.: Andrade & Vasconcelos Advocacia" className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60">E-mail de cobrança</label>
          <input name="billingEmail" type="email" required placeholder="financeiro@escritorio.adv.br" className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60">Nome do administrador</label>
          <input name="adminName" required placeholder="Nome de quem vai logar" className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60">E-mail do administrador</label>
          <input name="adminEmail" type="email" required placeholder="recebe o convite pra definir senha" className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60">Mensalidade (R$)</label>
          <MoneyInput name="monthlyFee" required defaultValue="890.00" className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-white/60">Dia de vencimento</label>
          <input name="billingDueDay" type="number" min={1} max={28} required defaultValue="5" className="mt-1 w-full border border-white/15 bg-grafite-700 text-white px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-white/60 mb-2 block">Módulos do plano</label>
        <div className="grid grid-cols-2 gap-2">
          {MODULE_OPTIONS.map((m) => (
            <label key={m.key} className="flex items-center gap-2 border border-white/15 px-3 py-2 text-sm text-white/85 cursor-pointer">
              <input
                type="checkbox"
                checked={modules[m.key]}
                onChange={(e) => setModules((prev) => ({ ...prev, [m.key]: e.target.checked }))}
                className="h-4 w-4 accent-marca"
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2.5">
        {loading ? "Criando..." : "Criar escritório e enviar convite"}
      </button>
    </form>
  );
}
