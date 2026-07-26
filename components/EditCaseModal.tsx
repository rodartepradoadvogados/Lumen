"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCase } from "@/lib/actions/cases";
import TribunalFields from "@/components/TribunalFields";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import { Pencil, X } from "lucide-react";

type CaseData = {
  id: string;
  clientId: string | null;
  opposingPartyName: string | null;
  opposingPartyRole: string | null;
  responsibleId: string | null;
  court: string | null;
  caseValue: number | null;
  tribunalSigla: string | null;
  tribunalNome: string | null;
  tribunalSistema: string | null;
  tribunalLink: string | null;
};

// Edição completa dos campos hoje mostrados como Field read-only no Card da aba Visão Geral
// (app/(app)/processos/[id]/page.tsx) — mesmo padrão de EditClientModal.tsx: botão que abre
// modal, formulário com Server Action, router.refresh() ao salvar.
export default function EditCaseModal({
  caseData,
  clients,
  users,
  tribunais,
}: {
  caseData: CaseData;
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  tribunais: TribunalCatalogEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Classes de input/select do modal — segue o par bg+texto do StartActingModal.tsx
  // (dark:bg-navy-800 + dark:text-cream-50 + dark:border-white/15), todos cobertos pelo MESMO
  // bloco de remap `.dark.theme-tarde` em globals.css. Evita criar uma classe CSS própria com
  // seletor `.dark` cru (como em novo/page.tsx), que ficaria fora da auditoria de contraste do
  // Tarde — regra prática já registrada neste projeto.
  const inputClass =
    "w-full mt-1 border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tip="Editar processo"
        className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/5 transition-colors"
      >
        <Pencil size={14} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Editar Processo</h3>
              <button onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setLoading(true);
                setError(null);
                const result = await updateCase(caseData.id, {
                  clientId: String(formData.get("clientId") || ""),
                  opposingPartyName: String(formData.get("opposingPartyName") || ""),
                  opposingPartyRole: String(formData.get("opposingPartyRole") || ""),
                  responsibleId: String(formData.get("responsibleId") || ""),
                  court: String(formData.get("court") || ""),
                  caseValue: String(formData.get("caseValue") || ""),
                  tribunalSigla: String(formData.get("tribunalSigla") || ""),
                  tribunalNome: String(formData.get("tribunalNome") || ""),
                  tribunalSistema: String(formData.get("tribunalSistema") || ""),
                  tribunalLink: String(formData.get("tribunalLink") || ""),
                });
                setLoading(false);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              }}
              className="p-5 space-y-3"
            >
              {error && (
                <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>
              )}

              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Cliente</label>
                <select name="clientId" defaultValue={caseData.clientId ?? ""} className={inputClass}>
                  <option value="">Não definido</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Parte Adversa</label>
                  <input name="opposingPartyName" defaultValue={caseData.opposingPartyName ?? ""} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Polo da Parte Adversa</label>
                  <select name="opposingPartyRole" defaultValue={caseData.opposingPartyRole ?? ""} className={inputClass}>
                    <option value="">Não definido</option>
                    <option value="AUTOR">Autor</option>
                    <option value="REU">Réu</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Advogado Responsável</label>
                <select name="responsibleId" defaultValue={caseData.responsibleId ?? ""} className={inputClass}>
                  <option value="">Não definido</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vara/Comarca</label>
                  <input name="court" defaultValue={caseData.court ?? ""} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor da Causa (R$)</label>
                  <input name="caseValue" type="number" step="0.01" defaultValue={caseData.caseValue ?? ""} className={inputClass} />
                </div>
              </div>

              <div className="border-t border-navy-800/8 dark:border-white/10 pt-3">
                <TribunalFields
                  tribunais={tribunais}
                  defaultSigla={caseData.tribunalSigla}
                  defaultNome={caseData.tribunalNome}
                  defaultSistema={caseData.tribunalSistema}
                  defaultLink={caseData.tribunalLink}
                  inputClassName={inputClass}
                />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
