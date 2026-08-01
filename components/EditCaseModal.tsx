"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCase } from "@/lib/actions/cases";
import ClientPicker from "@/components/ClientPicker";
import OpposingPartyFields from "@/components/OpposingPartyFields";
import TribunalFields from "@/components/TribunalFields";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import { naturezaOf, ESFERAS, MATERIAS_ADMIN } from "@/lib/caseNatureza";
import { Pencil } from "lucide-react";
import ModalShell from "@/components/ModalShell";

type CaseData = {
  id: string;
  // Natureza do processo (ver lib/caseNatureza.ts) — decide se os campos de esfera/matéria
  // administrativa abaixo aparecem. Não é editável aqui (mudar de natureza é uma operação mais
  // delicada, fora do escopo deste modal); só serve pra ligar/desligar a seção. Opcional (e
  // adminEsfera/adminMateria também) porque app/m/processos/[id]/page.tsx (mobile) reaproveita
  // este mesmo componente sem passar esses campos — naturezaOf(undefined) cai em "CASO", que
  // simplesmente mantém a seção administrativa oculta lá, sem quebrar nada.
  type?: string;
  responsibleId: string | null;
  court: string | null;
  caseValue: number | null;
  convictionValue?: number | null;
  economicBenefitValue?: number | null;
  tribunalSigla: string | null;
  tribunalNome: string | null;
  tribunalSistema: string | null;
  tribunalLink: string | null;
  adminEsfera?: string | null;
  adminMateria?: string | null;
  clients: { clientId: string | null; clientName?: string; role: string | null }[];
  parties: { name: string; document: string | null; address: string | null; role: string | null }[];
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
  const isAdministrativo = naturezaOf(caseData.type) === "ADMINISTRATIVO";

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
        <ModalShell size="cheio" title="Editar Processo" onClose={() => setOpen(false)}>
          <form
            action={async (formData) => {
              setLoading(true);
              setError(null);
              const parsedClients = formData
                .getAll("clientEntries")
                .map((raw) => {
                  try {
                    return JSON.parse(String(raw));
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean);
              const parsedParties = formData
                .getAll("partyEntries")
                .map((raw) => {
                  try {
                    return JSON.parse(String(raw));
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean);
              const result = await updateCase(caseData.id, {
                clients: parsedClients,
                parties: parsedParties,
                responsibleId: String(formData.get("responsibleId") || ""),
                court: String(formData.get("court") || ""),
                caseValue: String(formData.get("caseValue") || ""),
                convictionValue: String(formData.get("convictionValue") || ""),
                economicBenefitValue: String(formData.get("economicBenefitValue") || ""),
                tribunalSigla: String(formData.get("tribunalSigla") || ""),
                tribunalNome: String(formData.get("tribunalNome") || ""),
                tribunalSistema: String(formData.get("tribunalSistema") || ""),
                tribunalLink: String(formData.get("tribunalLink") || ""),
                // updateCase só grava esses dois quando o type EFETIVO (o já salvo, já que este
                // modal não edita natureza) é ADMINISTRATIVO — enviar sempre é inofensivo.
                adminEsfera: String(formData.get("adminEsfera") || ""),
                adminMateria: String(formData.get("adminMateria") || ""),
              });
              setLoading(false);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setOpen(false);
              router.refresh();
            }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              {error && (
                <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Duas colunas a partir de md — só faz sentido porque a janela agora tem largura
                  de sobra (80%); em telas estreitas cai pra uma coluna só, igual antes. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
                <div className="space-y-3">
                  <ClientPicker
                    clients={clients}
                    inputClassName={inputClass}
                    initial={caseData.clients.length > 0 ? caseData.clients.map((c) => ({ clientId: c.clientId, clientName: c.clientName, role: c.role })) : undefined}
                  />

                  <OpposingPartyFields inputClassName={inputClass} initial={caseData.parties.length > 0 ? caseData.parties : undefined} />

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
                </div>

                <div className="space-y-3">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Proveito Econômico (R$)</label>
                      <input name="economicBenefitValue" type="number" step="0.01" defaultValue={caseData.economicBenefitValue ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor da Condenação (R$)</label>
                      <input name="convictionValue" type="number" step="0.01" defaultValue={caseData.convictionValue ?? ""} className={inputClass} />
                    </div>
                  </div>
                  <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                    Valor da Causa, Proveito Econômico e Valor da Condenação são as bases disponíveis para honorários lançados em percentual (aba Financeiro).
                  </p>

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

                  {/* Esfera/Matéria só fazem sentido para processo administrativo (ver
                      lib/caseNatureza.ts) — para os demais, updateCase sempre grava os dois como
                      null, então nem exibe o <select> aqui. */}
                  {isAdministrativo && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-navy-800/8 dark:border-white/10 pt-3">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Esfera</label>
                        <select name="adminEsfera" defaultValue={caseData.adminEsfera ?? ""} className={inputClass}>
                          <option value="">Selecione...</option>
                          {ESFERAS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Matéria</label>
                        <select name="adminMateria" defaultValue={caseData.adminMateria ?? ""} className={inputClass}>
                          <option value="">Selecione...</option>
                          {MATERIAS_ADMIN.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-navy-800/8 dark:border-white/10 px-5 py-3 flex justify-end bg-cream-50/60 dark:bg-white/5">
              <button
                type="submit"
                disabled={loading}
                className="bg-gold-600 hover:bg-gold-700 text-white font-semibold px-5 py-2 rounded-lg disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}
