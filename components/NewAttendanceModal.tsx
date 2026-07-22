"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAttendance, saveAttendanceDraft, searchClients } from "@/lib/actions/attendance";
import { Plus, X } from "lucide-react";
import ClientQualificationModal from "@/components/ClientQualificationModal";
import AssessoriaSelect from "@/components/AssessoriaSelect";

type ClientHit = { id: string; name: string; phone: string | null; email: string | null };
type AssessoriaOption = { id: string; clientName: string };

const emptyState = {
  clientMode: "novo" as "novo" | "selecionar",
  selectedClient: null as ClientHit | null,
  clientQuery: "",
  contactPhone: "",
  clientEmail: "",
};

export default function NewAttendanceModal({
  users,
  assessorias,
  autoOpen,
}: {
  users: { id: string; name: string }[];
  assessorias: AssessoriaOption[];
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!autoOpen);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [formError, setFormError] = useState("");

  const [clientMode, setClientMode] = useState<"novo" | "selecionar">(emptyState.clientMode);
  const [selectedClient, setSelectedClient] = useState<ClientHit | null>(emptyState.selectedClient);
  const [clientQuery, setClientQuery] = useState(emptyState.clientQuery);
  const [clientResults, setClientResults] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [contactPhone, setContactPhone] = useState(emptyState.contactPhone);
  const [clientEmail, setClientEmail] = useState(emptyState.clientEmail);

  const [qualification, setQualification] = useState<{ clientId: string; attendanceId: string } | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const searchReqId = useRef(0);

  // Busca dinâmica de clientes cadastrados (debounce de 300ms), só quando estamos no
  // modo "selecionar" e ainda não escolhemos ninguém.
  useEffect(() => {
    if (clientMode !== "selecionar" || selectedClient) return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const reqId = ++searchReqId.current;
    const timer = setTimeout(async () => {
      const res = await searchClients(q);
      if (reqId !== searchReqId.current) return; // resposta obsoleta
      setClientResults(res);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientQuery, clientMode, selectedClient]);

  function resetForm() {
    setDirty(false);
    setConfirmClose(false);
    setFormError("");
    setClientMode(emptyState.clientMode);
    setSelectedClient(emptyState.selectedClient);
    setClientQuery(emptyState.clientQuery);
    setClientResults([]);
    setSearching(false);
    setContactPhone(emptyState.contactPhone);
    setClientEmail(emptyState.clientEmail);
    formRef.current?.reset();
  }

  function openFresh() {
    resetForm();
    setOpen(true);
  }

  function handleCloseAttempt() {
    if (!dirty) {
      setOpen(false);
      resetForm();
      return;
    }
    setConfirmClose(true);
  }

  function pickClient(c: ClientHit) {
    setSelectedClient(c);
    setContactPhone(c.phone || "");
    setClientEmail(c.email || "");
    setClientQuery("");
    setDirty(true);
  }

  function collectFieldsFromForm() {
    const fd = new FormData(formRef.current!);
    const rawValue = String(fd.get("estimatedValue") || "").trim();
    return {
      clientName: clientMode === "selecionar" ? selectedClient?.name || "" : String(fd.get("clientName") || ""),
      contactPhone,
      clientEmail,
      clientId: clientMode === "selecionar" ? selectedClient?.id : undefined,
      subject: String(fd.get("subject") || ""),
      area: String(fd.get("area") || ""),
      description: String(fd.get("description") || ""),
      channel: String(fd.get("channel") || "WHATSAPP"),
      responsibleId: String(fd.get("responsibleId") || ""),
      estimatedValue: rawValue ? Number(rawValue) : null,
      leadSource: String(fd.get("leadSource") || ""),
      nextContactAt: String(fd.get("nextContactAt") || ""),
      assessoriaId: String(fd.get("assessoriaId") || ""),
    };
  }

  async function handleSaveDraft() {
    setLoading(true);
    await saveAttendanceDraft(collectFieldsFromForm());
    setLoading(false);
    setOpen(false);
    resetForm();
    router.refresh();
  }

  function handleDiscard() {
    setOpen(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (clientMode === "selecionar" && !selectedClient) {
      setFormError('Selecione um cliente ou troque para "Cadastrar novo cliente".');
      return;
    }
    setFormError("");
    setLoading(true);
    const result = await createAttendance({
      ...collectFieldsFromForm(),
      isNewClient: clientMode === "novo",
    });
    setLoading(false);
    setOpen(false);
    if (result.newClientId) {
      setQualification({ clientId: result.newClientId, attendanceId: result.id });
    }
    resetForm();
    router.refresh();
  }

  return (
    <>
      <button onClick={openFresh} className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
        <Plus size={16} /> Novo Atendimento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-pop w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 shrink-0">
              <h3 className="font-serif font-bold text-navy-900">Novo Atendimento</h3>
              <button onClick={handleCloseAttempt} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <form ref={formRef} onSubmit={handleSubmit} onChange={() => setDirty(true)} className="p-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-xs font-medium text-navy-800/60">Nome do Contato</label>
                        <div className="flex gap-1 bg-cream-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => setClientMode("novo")}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                              clientMode === "novo" ? "bg-white shadow-sm text-navy-900" : "text-navy-800/50 hover:text-navy-900"
                            }`}
                          >
                            Cadastrar novo cliente
                          </button>
                          <button
                            type="button"
                            onClick={() => setClientMode("selecionar")}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                              clientMode === "selecionar" ? "bg-white shadow-sm text-navy-900" : "text-navy-800/50 hover:text-navy-900"
                            }`}
                          >
                            Selecionar cliente
                          </button>
                        </div>
                      </div>

                      {clientMode === "novo" ? (
                        <input name="clientName" required className="at-input" placeholder="Nome completo" />
                      ) : selectedClient ? (
                        <div className="at-input flex items-center justify-between bg-cream-50">
                          <span className="text-sm text-navy-900 truncate">{selectedClient.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClient(null);
                              setClientQuery("");
                              setDirty(true);
                            }}
                            className="text-xs font-semibold text-gold-700 hover:underline shrink-0 ml-2"
                          >
                            trocar
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            value={clientQuery}
                            onChange={(e) => setClientQuery(e.target.value)}
                            placeholder="Buscar cliente cadastrado..."
                            className="at-input"
                          />
                          {clientQuery.trim().length >= 2 && (
                            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-navy-800/10 rounded-lg shadow-pop max-h-48 overflow-y-auto scrollbar-thin">
                              {searching && <p className="px-3 py-2 text-xs text-navy-800/50">Buscando...</p>}
                              {!searching && clientResults.length === 0 && (
                                <p className="px-3 py-2 text-xs text-navy-800/50">Nenhum cliente encontrado.</p>
                              )}
                              {!searching &&
                                clientResults.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => pickClient(c)}
                                    className="flex flex-col items-start w-full px-3 py-2 text-left hover:bg-cream-50 transition-colors"
                                  >
                                    <span className="text-sm text-navy-900">{c.name}</span>
                                    {(c.phone || c.email) && (
                                      <span className="text-xs text-navy-800/45">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                                    )}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Assunto (do que se trata)</label>
                      <input name="subject" required className="at-input" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">Telefone</label>
                        <input
                          name="contactPhone"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          className="at-input"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">E-mail</label>
                        <input
                          name="clientEmail"
                          type="email"
                          value={clientEmail}
                          onChange={(e) => setClientEmail(e.target.value)}
                          className="at-input"
                          placeholder="cliente@exemplo.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Descrição detalhada do que precisa</label>
                      <textarea name="description" rows={4} className="at-input resize-y max-h-[40vh]" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">Matéria</label>
                        <select name="area" className="at-input">
                          <option value="">Não definida</option>
                          <option value="Cível">Cível</option>
                          <option value="Trabalhista">Trabalhista</option>
                          <option value="Tributário">Tributário</option>
                          <option value="Família">Família</option>
                          <option value="Sucessões">Sucessões</option>
                          <option value="Criminal">Criminal</option>
                          <option value="Previdenciário">Previdenciário</option>
                          <option value="Empresarial">Empresarial</option>
                          <option value="Consumidor">Consumidor</option>
                          <option value="Administrativo">Administrativo</option>
                          <option value="Outra">Outra</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">Canal</label>
                        <select name="channel" className="at-input">
                          <option value="WHATSAPP">WhatsApp</option>
                          <option value="EMAIL">E-mail</option>
                          <option value="TELEFONE">Telefone</option>
                          <option value="PRESENCIAL">Presencial</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Responsável pela triagem</label>
                      <select name="responsibleId" className="at-input">
                        <option value="">Não definido</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <AssessoriaSelect assessorias={assessorias} inputClassName="at-input" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">Valor estimado (R$)</label>
                        <input name="estimatedValue" type="number" step="0.01" min="0" className="at-input" placeholder="0,00" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-800/60">Origem do lead</label>
                        <select name="leadSource" className="at-input">
                          <option value="">Não definida</option>
                          <option value="INDICACAO">Indicação</option>
                          <option value="INSTAGRAM">Instagram</option>
                          <option value="GOOGLE">Google</option>
                          <option value="SITE">Site</option>
                          <option value="WHATSAPP">WhatsApp</option>
                          <option value="OUTRO">Outro</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-navy-800/60">Próximo contato / follow-up</label>
                      <input name="nextContactAt" type="date" className="at-input" />
                    </div>
                  </div>
                </div>

                {formError && <p className="text-xs font-semibold text-red-600">{formError}</p>}

                <button type="submit" disabled={loading} className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? "Salvando..." : "Criar"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {confirmClose && (
        <div className="fixed inset-0 z-[60] bg-navy-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-pop w-full max-w-sm p-5 space-y-4">
            <p className="text-sm font-medium text-navy-900">Deseja salvar o rascunho deste atendimento e continuar depois?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={loading}
                className="w-full bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button
                onClick={handleDiscard}
                className="w-full bg-white border border-navy-800/12 hover:bg-cream-100 text-navy-800/70 text-sm font-semibold py-2 rounded-lg"
              >
                Descartar
              </button>
              <button onClick={() => setConfirmClose(false)} className="w-full text-xs font-semibold text-navy-800/50 hover:text-navy-900 py-1">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {qualification && (
        <ClientQualificationModal
          clientId={qualification.clientId}
          attendanceId={qualification.attendanceId}
          onClose={() => {
            setQualification(null);
            router.refresh();
          }}
        />
      )}

      <style jsx global>{`
        .at-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .at-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </>
  );
}
