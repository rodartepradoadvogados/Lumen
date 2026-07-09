"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createReceivable } from "@/lib/actions/financeiro";
import { createClientQuick } from "@/lib/actions/contatos";
import { createCaseQuick } from "@/lib/actions/cases";
import { Plus, X } from "lucide-react";
import QuickAddSelect from "@/components/QuickAddSelect";

type Option = { id: string; name: string };

export default function NewReceivableModal({
  categories,
  cases,
  clients,
  costCenters = [],
  defaultCaseId,
  defaultClientId,
  label,
  alreadyReceivedForCase,
}: {
  categories: Option[];
  cases: Option[];
  clients: Option[];
  costCenters?: Option[];
  defaultCaseId?: string;
  defaultClientId?: string;
  label?: string;
  alreadyReceivedForCase?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [splitSuccess, setSplitSuccess] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} /> {label ?? "Nova Conta a Receber"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">{label ?? "Nova Conta a Receber"}</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                await createReceivable({
                  description: String(formData.get("description")),
                  amount: String(formData.get("amount")),
                  dueDate: String(formData.get("dueDate")),
                  kind: String(formData.get("kind")),
                  categoryId: String(formData.get("categoryId") || ""),
                  costCenterId: String(formData.get("costCenterId") || ""),
                  clientId: String(formData.get("clientId") || ""),
                  caseId: String(formData.get("caseId") || ""),
                  successAmount: splitSuccess ? String(formData.get("successAmount") || "") : undefined,
                });
                setLoading(false);
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              {alreadyReceivedForCase !== undefined && (
                <p className="text-xs text-navy-800/50 bg-cream-50 rounded-lg px-3 py-2">
                  Já recebido neste processo: <span className="font-semibold text-navy-900">{alreadyReceivedForCase.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                </p>
              )}
              <div>
                <label className="text-xs font-medium text-navy-800/60">Descrição</label>
                <input name="description" required className="fin-input" placeholder="Ex: Honorários contratuais - parcela 1/6" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">{splitSuccess ? "Valor a receber agora (R$)" : "Valor (R$)"}</label>
                  <input name="amount" type="number" step="0.01" required className="fin-input" />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Vencimento (parte de agora)</label>
                  <input name="dueDate" type="date" required className="fin-input" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-navy-800/70">
                <input type="checkbox" checked={splitSuccess} onChange={(e) => setSplitSuccess(e.target.checked)} />
                Dividir: parte agora + parte no êxito (sem vencimento definido)
              </label>

              {splitSuccess && (
                <div className="p-3 rounded-lg bg-cream-50 border border-navy-800/8">
                  <label className="text-xs font-medium text-navy-800/60">Valor a receber no êxito (R$)</label>
                  <input name="successAmount" type="number" step="0.01" className="fin-input" />
                  <p className="text-[11px] text-navy-800/45 mt-1">Fica sem vencimento e aparece na Central de Alertas para acompanhamento.</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-navy-800/60">Tipo de Honorário</label>
                <select name="kind" className="fin-input">
                  <option value="HONORARIOS_CONTRATUAIS">Honorários Contratuais</option>
                  <option value="HONORARIOS_SUCUMBENCIAIS">Honorários Sucumbenciais</option>
                  <option value="OUTROS">Outros</option>
                  <option value="REEMBOLSO">Reembolso</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Categoria</label>
                  <select name="categoryId" className="fin-input">
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Centro de Custo</label>
                  <select name="costCenterId" className="fin-input">
                    <option value="">Nenhum</option>
                    {costCenters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-800/60">Cliente</label>
                <QuickAddSelect
                  name="clientId"
                  options={clients}
                  defaultValue={defaultClientId}
                  placeholder="Nome do novo cliente"
                  addLabel="Cadastrar novo cliente"
                  onQuickAdd={createClientQuick}
                />
              </div>
              {!defaultCaseId && (
                <div>
                  <label className="text-xs font-medium text-navy-800/60">Processo vinculado (opcional)</label>
                  <QuickAddSelect
                    name="caseId"
                    options={cases}
                    placeholder="Título do novo processo/caso"
                    addLabel="Cadastrar novo processo"
                    onQuickAdd={(name) => createCaseQuick(name)}
                  />
                </div>
              )}
              {defaultCaseId && <input type="hidden" name="caseId" value={defaultCaseId} />}
              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Criar"}
              </button>
            </form>
          </div>
        </div>
      )}
      <style jsx global>{`
        .fin-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .fin-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
