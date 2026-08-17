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
import CaseMateriaField from "@/components/processo/CaseMateriaField";
import AssuntosField from "@/components/processo/AssuntosField";
import InstanciaTribunalPanel, { type CaseInstanceHistoryEntry } from "@/components/processo/InstanciaTribunalPanel";
import CaseLinkField from "@/components/processo/CaseLinkField";
import { formatDate } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";

type CaseData = {
  id: string;
  // Título mostrado em toda lista/vínculo do processo (ex.: "Casos vinculados" da Assessoria).
  // Por padrão é recalculado sozinho como "Cliente(s) x Parte(s)" sempre que os dois lados estão
  // preenchidos (ver computeCaseTitle, lib/actions/cases.ts) — editar este campo aqui só o
  // sobrepõe quando o texto digitado for DIFERENTE do que a convenção geraria; deixando como está
  // (sem mexer), o comportamento automático de sempre continua igual a antes deste campo existir.
  title?: string;
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
  // Classificação (ver proposta aprovada em 2026-08-07) — opcionais pelo mesmo motivo dos demais
  // campos "novos": telas mais antigas que ainda não foram adaptadas a passá-los continuam
  // funcionando (nascem vazias/nulas).
  description?: string | null;
  materias?: string[];
  assuntos?: string[];
  distributedAt?: string | null;
  createdAt?: string;
  // Instância/tribunal de recurso — ver lib/caseInstance.ts e InstanciaTribunalPanel.tsx.
  currentInstance?: string | null;
  currentInstanceDetail?: string | null;
  tribunalOrigemSigla?: string | null;
  tribunalOrigemNome?: string | null;
  instance?: string | null;
};

type CaseLinkEntry = {
  linkId: string;
  other: { id: string; title: string; processNumber: string | null };
  role: "PRINCIPAL" | "VINCULADO" | "NENHUM_PRINCIPAL";
};

// Edição completa dos campos hoje mostrados como Field read-only no Card da aba Visão Geral
// (app/(app)/processos/[id]/page.tsx) — mesmo padrão de EditClientModal.tsx: botão que abre
// modal, formulário com Server Action, router.refresh() ao salvar.
export default function EditCaseModal({
  caseData,
  clients,
  users,
  tribunais,
  caseLinks = [],
  instanceHistory = [],
}: {
  caseData: CaseData;
  clients: { id: string; name: string }[];
  users: { id: string; name: string }[];
  tribunais: TribunalCatalogEntry[];
  // Vínculos com outros processos (ver components/processo/CaseLinkField.tsx) — opcional pelo
  // mesmo motivo dos demais campos novos: telas mais antigas que ainda não passam continuam
  // funcionando (nasce sem nenhum vínculo pra mostrar).
  caseLinks?: CaseLinkEntry[];
  // Histórico de escaladas de instância (ver getCaseInstanceHistory, lib/actions/cases.ts) —
  // mesmo motivo de opcional dos demais.
  instanceHistory?: CaseInstanceHistoryEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdministrativo = naturezaOf(caseData.type) === "ADMINISTRATIVO";

  // Classes de input/select do modal — segue o par bg+texto do StartActingModal.tsx.
  const inputClass = "w-full mt-1 border border-regua bg-sf text-tx rounded-lg px-3 py-2 text-sm";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tip="Editar processo"
        className="p-1.5 rounded-lg text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors"
      >
        <Pencil size={14} />
      </button>
      {open && (
        <ModalShell size="cheio" title="Editar Processo" onClose={() => setOpen(false)}>
          <form
            action={async (formData) => {
              setLoading(true);
              setError(null);
              try {
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
                  title: String(formData.get("title") || ""),
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
                  description: String(formData.get("description") || ""),
                  materias: formData.getAll("materias").map(String),
                  assuntos: formData.getAll("assuntos").map(String),
                  distributedAt: String(formData.get("distributedAt") || ""),
                  currentInstance: String(formData.get("currentInstance") || ""),
                  currentInstanceDetail: String(formData.get("currentInstanceDetail") || ""),
                });
                setLoading(false);
                if (result?.error) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              } catch (err) {
                setLoading(false);
                setError(err instanceof Error ? err.message : "Não foi possível salvar as alterações. Tente novamente.");
              }
            }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              {error && (
                <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-3 py-2">{error}</p>
              )}

              <div>
                <label className="text-xs font-medium text-tx-2">Título</label>
                <input name="title" defaultValue={caseData.title ?? ""} className={inputClass} />
                <p className="text-[11px] text-tx-3 mt-1">
                  Por padrão segue sozinho a convenção &ldquo;Cliente(s) x Parte(s)&rdquo; ao trocar cliente/parte. Editar aqui
                  substitui esse texto automático.
                </p>
              </div>

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
                    <label className="text-xs font-medium text-tx-2">Advogado Responsável</label>
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
                      <label className="text-xs font-medium text-tx-2">Vara/Comarca</label>
                      <input name="court" defaultValue={caseData.court ?? ""} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Valor da Causa (R$)</label>
                      <MoneyInput name="caseValue" defaultValue={caseData.caseValue != null ? String(caseData.caseValue) : undefined} className={inputClass} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-tx-2">Proveito Econômico (R$)</label>
                      <MoneyInput name="economicBenefitValue" defaultValue={caseData.economicBenefitValue != null ? String(caseData.economicBenefitValue) : undefined} className={inputClass} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Valor da Condenação (R$)</label>
                      <MoneyInput name="convictionValue" defaultValue={caseData.convictionValue != null ? String(caseData.convictionValue) : undefined} className={inputClass} />
                    </div>
                  </div>
                  <p className="text-[11px] text-tx-2">
                    Valor da Causa, Proveito Econômico e Valor da Condenação são as bases disponíveis para honorários lançados em percentual (aba Financeiro).
                  </p>

                  <div className="border-t border-regua pt-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-regua pt-3">
                      <div>
                        <label className="text-xs font-medium text-tx-2">Esfera</label>
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
                        <label className="text-xs font-medium text-tx-2">Matéria</label>
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

              <div className="border-t border-regua pt-3 mt-1 space-y-3">
                <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Instância</p>
                <InstanciaTribunalPanel
                  caseId={caseData.id}
                  currentInstance={caseData.currentInstance ?? null}
                  currentInstanceDetail={caseData.currentInstanceDetail ?? null}
                  tribunalOrigemSigla={caseData.tribunalOrigemSigla ?? null}
                  tribunalOrigemNome={caseData.tribunalOrigemNome ?? null}
                  origemInstance={caseData.instance ?? null}
                  history={instanceHistory}
                  inputClassName={inputClass}
                />
              </div>

              <div className="border-t border-regua pt-3 space-y-3">
                <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Classificação</p>
                <CaseMateriaField defaultValue={caseData.materias ?? []} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-tx-2">Data da distribuição</label>
                    <input
                      name="distributedAt"
                      type="date"
                      defaultValue={caseData.distributedAt ? caseData.distributedAt.slice(0, 10) : ""}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-tx-2">Criado no Lúmen</label>
                    <p className="mt-1 px-3 py-2 text-sm text-tx-2">
                      {caseData.createdAt ? formatDate(caseData.createdAt) : "—"}
                    </p>
                  </div>
                </div>
                <AssuntosField defaultValue={caseData.assuntos ?? []} inputClassName={inputClass} />
                <div>
                  <label className="text-xs font-medium text-tx-2">Descrição (observações livres)</label>
                  <textarea name="description" rows={2} defaultValue={caseData.description ?? ""} className={inputClass} />
                </div>
              </div>

              <div className="border-t border-regua pt-3">
                <CaseLinkField caseId={caseData.id} links={caseLinks} />
              </div>
            </div>

            <div className="shrink-0 border-t border-regua px-5 py-3 flex justify-end bg-sf-apoio">
              <button
                type="submit"
                disabled={loading}
                className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold px-5 py-2 rounded-lg disabled:opacity-50"
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
