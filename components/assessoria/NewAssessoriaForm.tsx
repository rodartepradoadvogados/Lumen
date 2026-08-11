"use client";

import { useState, useTransition } from "react";
import { createAssessoria } from "@/lib/actions/assessoria";

type ClientOption = { id: string; name: string };
type UserOption = { id: string; name: string };

export default function NewAssessoriaForm({ clients, users }: { clients: ClientOption[]; users: UserOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAssessoria({
        clientId: String(formData.get("clientId") || ""),
        monthlyFee: String(formData.get("monthlyFee") || "0"),
        dueDay: String(formData.get("dueDay") || "5"),
        responsibleId: String(formData.get("responsibleId") || ""),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-tx-2">Empresa (cliente PJ)</label>
        <select name="clientId" required className="input">
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
          <label className="text-xs font-medium text-tx-2">Honorário mensal (R$)</label>
          <input name="monthlyFee" type="number" step="0.01" required className="input" placeholder="4500.00" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Dia de vencimento</label>
          <input name="dueDay" type="number" min="1" max="28" defaultValue="5" required className="input" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-tx-2">Responsável</label>
        <select name="responsibleId" className="input">
          <option value="">Não definido</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs font-semibold text-urgente">{error}</p>}

      <button type="submit" disabled={pending} className="w-full bg-acao hover:bg-acao-hover text-acao-tx font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50">
        {pending ? "Criando..." : "Criar Assessoria"}
      </button>

      {/* Sem classe .dark própria: --regua-forte/--tx/--sf-superficie (app/globals.css) já trocam
          de valor sozinhas entre Manhã e Noite — nenhum hex cravado (DESIGN-SYSTEM.md §0/§16). */}
      <style>{`
        .input { width: 100%; margin-top: 0.25rem; border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--tx); background: var(--sf-superficie); }
        .input:focus { outline: none; box-shadow: 0 0 0 2px var(--acao-bg); }
      `}</style>
    </form>
  );
}
