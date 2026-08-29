"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAssessoriaMobile } from "@/lib/actions/assessoria";
import MoneyInput from "@/components/MoneyInput";

const inputClass =
  "w-full mt-1 border border-regua px-3 py-2 text-sm text-tx bg-sf focus:outline-none focus:ring-2 focus:ring-acao/40";
const labelClass = "text-xs font-medium text-tx-2";

type ClientOption = { id: string; name: string };
type UserOption = { id: string; name: string };

export default function MobileNewAssessoriaForm({ clients, users }: { clients: ClientOption[]; users: UserOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAssessoriaMobile({
        clientId: String(formData.get("clientId") || ""),
        monthlyFee: String(formData.get("monthlyFee") || "0"),
        dueDay: String(formData.get("dueDay") || "5"),
        responsibleId: String(formData.get("responsibleId") || ""),
      });
      if (result?.error) setError(result.error);
      else if (result?.id) router.push(`/m/assessoria/${result.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Empresa (cliente PJ)</label>
        <select name="clientId" required className={inputClass}>
          <option value="">Selecionar empresa...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {clients.length === 0 && (
          <p className="text-xs text-tx-2 mt-1">
            Nenhuma empresa PJ disponível — cadastre o cliente em Contatos primeiro, ou todas já têm assessoria.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Honorário mensal (R$)</label>
          <MoneyInput name="monthlyFee" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Dia de vencimento</label>
          <input name="dueDay" type="number" min="1" max="28" defaultValue="5" required className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Responsável</label>
        <select name="responsibleId" className={inputClass}>
          <option value="">Não definido</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs font-semibold text-urgente">{error}</p>}

      <button type="submit" disabled={pending} className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50">
        {pending ? "Criando..." : "Criar Assessoria"}
      </button>
    </form>
  );
}
