"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  createAttendance,
  saveAttendanceDraft,
  searchClients,
  checkOpposingPartyConflict,
} from "@/lib/actions/attendance";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import { Plus, X, UploadCloud, AlertTriangle } from "lucide-react";
import ClientQualificationModal from "@/components/ClientQualificationModal";
import AssessoriaSelect from "@/components/AssessoriaSelect";
import SecaoLancamento from "@/components/financeiro/SecaoLancamento";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import PendenciasEditor, { type PendenciaRow } from "@/components/PendenciasEditor";
import { PERCENTUAL_BASE_LABELS } from "@/lib/honorarioLancamento";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import MoneyInput from "@/components/MoneyInput";
import PhoneInput, { type PhoneValue } from "@/components/PhoneInput";
import { DEFAULT_COUNTRY } from "@/lib/countries";

type ClientHit = { id: string; name: string; phone: string | null; phoneDdi: string | null; email: string | null };
type AssessoriaOption = { id: string; clientName: string; status?: string };
type ConflictMatch = { id: string; title: string; processNumber: string | null };
type FeeMode = "DINHEIRO" | "PERCENTUAL" | "AMBOS";
type StagedAttachment = { key: string; file: File; name: string; docType: string };

const emptyState = {
  clientMode: "novo" as "novo" | "selecionar",
  selectedClient: null as ClientHit | null,
  clientQuery: "",
  contactPhone: { ddi: DEFAULT_COUNTRY.ddi, numero: "" } as PhoneValue,
  clientEmail: "",
  clientNameNovo: "",
};

// Formata uma Date no fuso local no formato exigido por <input type="datetime-local"> — calculado
// SÓ no client (useEffect, nunca no render inicial) para não arriscar hidratação divergente entre
// servidor e navegador por causa de segundos de diferença no "agora".
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-xs font-semibold px-3 py-1.5 border transition-colors ${
            // Mesmo padrão do controle segmentado (DESIGN-SYSTEM.md §5): opção ativa inverte —
            // fundo na cor do texto, texto na cor da superfície — sem cor de acento.
            value === opt.value ? "bg-tx text-sf border-tx" : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function NewAttendanceModal({
  users,
  assessorias,
  autoOpen,
  defaultAssessoriaId,
}: {
  users: { id: string; name: string }[];
  assessorias: AssessoriaOption[];
  autoOpen?: boolean;
  // Vem de ?assessoriaId= na URL — o botão "Novo atendimento" da própria tela de uma Assessoria
  // linka para cá assim, para o atendimento nascer já vinculado (ver app/(app)/atendimento/page.tsx).
  defaultAssessoriaId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!autoOpen);
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [formError, setFormError] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  const [clientMode, setClientMode] = useState<"novo" | "selecionar">(emptyState.clientMode);
  const [clientNameNovo, setClientNameNovo] = useState(emptyState.clientNameNovo);
  const [selectedClient, setSelectedClient] = useState<ClientHit | null>(emptyState.selectedClient);
  const [clientQuery, setClientQuery] = useState(emptyState.clientQuery);
  const [clientResults, setClientResults] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [contactPhone, setContactPhone] = useState(emptyState.contactPhone);
  const [clientEmail, setClientEmail] = useState(emptyState.clientEmail);

  // Conflito de interesses (Fase 5) — checa o nome digitado contra parte adversa de qualquer
  // processo do escritório. Só avisa, nunca bloqueia (ver checkOpposingPartyConflict).
  const [conflictMatches, setConflictMatches] = useState<ConflictMatch[]>([]);
  const conflictReqId = useRef(0);

  // Prazo de resposta ao lead (Fase 5) — default 24h após a criação, calculado no mount (client-only).
  const [responseDeadline, setResponseDeadline] = useState("");

  // Honorário pretendido (Fase 5) — mesmo vocabulário do financeiro (lib/honorarioLancamento.ts).
  const [feeMode, setFeeMode] = useState<FeeMode>("DINHEIRO");
  const [feePercentual, setFeePercentual] = useState("");
  const [feePercentualBase, setFeePercentualBase] = useState("VALOR_CAUSA");

  // Pendências (Fase 5) — ainda sem attendanceId (o atendimento nem existe até o submit); viram
  // AtendimentoPendencia de verdade só depois, dentro de createAttendance/saveAttendanceDraft.
  const [pendenciaRows, setPendenciaRows] = useState<PendenciaRow[]>([]);

  // Anexos (Fase 5) — ficam "em espera" (File no navegador) até o atendimento ser criado, porque
  // o upload de verdade (Drive) exige um attendanceId que só existe depois do Create. Ver
  // handleSubmit: 1) cria o atendimento, 2) sobe os anexos um a um mostrando progresso, 3) só então
  // fecha a janela.
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guarda o id assim que o atendimento é criado — se o upload de algum anexo falhar e o usuário
  // clicar em "Criar"/"Reenviar" de novo, o submit precisa SÓ retentar os anexos que faltaram, sem
  // criar um segundo Attendance duplicado (ver handleSubmit).
  const [createdAttendanceId, setCreatedAttendanceId] = useState<string | null>(null);

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

  // Conflito de interesses (Fase 5): mesmo padrão de debounce acima, sobre o nome efetivo do
  // contato (o que está sendo digitado em "novo", ou já escolhido/buscado em "selecionar").
  const effectiveContactName = clientMode === "novo" ? clientNameNovo : selectedClient?.name || clientQuery;
  useEffect(() => {
    const name = effectiveContactName.trim();
    if (name.length < 3) {
      setConflictMatches([]);
      return;
    }
    const reqId = ++conflictReqId.current;
    const timer = setTimeout(async () => {
      const res = await checkOpposingPartyConflict(name);
      if (reqId !== conflictReqId.current) return;
      setConflictMatches(res);
    }, 400);
    return () => clearTimeout(timer);
  }, [effectiveContactName]);

  // Default do prazo de resposta (24h após "agora") — calculado só depois de montado no client,
  // nunca durante o render (evita hidratação divergente por causa de segundos de diferença).
  useEffect(() => {
    if (open && !responseDeadline) {
      setResponseDeadline(toDatetimeLocal(new Date(Date.now() + 24 * 3600 * 1000)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetForm() {
    setDirty(false);
    setConfirmClose(false);
    setFormError("");
    setUploadWarnings([]);
    setProgressText("");
    setClientMode(emptyState.clientMode);
    setClientNameNovo(emptyState.clientNameNovo);
    setSelectedClient(emptyState.selectedClient);
    setClientQuery(emptyState.clientQuery);
    setClientResults([]);
    setSearching(false);
    setContactPhone(emptyState.contactPhone);
    setClientEmail(emptyState.clientEmail);
    setConflictMatches([]);
    setResponseDeadline("");
    setFeeMode("DINHEIRO");
    setFeePercentual("");
    setFeePercentualBase("VALOR_CAUSA");
    setPendenciaRows([]);
    setStagedAttachments([]);
    setCreatedAttendanceId(null);
    formRef.current?.reset();
  }

  function openFresh() {
    resetForm();
    setOpen(true);
  }

  function handleCloseAttempt() {
    // Se o atendimento já foi criado de verdade (fluxo de reenvio de anexo que falhou), não faz
    // sentido oferecer "salvar rascunho" — o registro já existe, não é mais um rascunho. Anexos
    // que ainda faltarem sobem depois na própria tela do atendimento.
    if (!dirty || createdAttendanceId) {
      setOpen(false);
      resetForm();
      router.refresh();
      return;
    }
    setConfirmClose(true);
  }

  // Esc passa pelo mesmo caminho do X (handleCloseAttempt) — respeita o aviso de "alteração não
  // salva" em vez de fechar direto. Quando o próprio aviso já está aberto (confirmClose), Esc
  // cancela SÓ o aviso (mesmo destino do botão "Cancelar" dele, abaixo) em vez de acionar
  // handleCloseAttempt de novo por cima.
  useEscapeToClose(open && !confirmClose, handleCloseAttempt);
  useEscapeToClose(confirmClose, () => setConfirmClose(false));

  function pickClient(c: ClientHit) {
    setSelectedClient(c);
    setContactPhone({ ddi: c.phoneDdi || DEFAULT_COUNTRY.ddi, numero: c.phone || "" });
    setClientEmail(c.email || "");
    setClientQuery("");
    setDirty(true);
  }

  function collectFieldsFromForm() {
    const fd = new FormData(formRef.current!);
    const rawValue = String(fd.get("estimatedValue") || "").trim();
    return {
      clientName: clientMode === "selecionar" ? selectedClient?.name || "" : clientNameNovo,
      contactPhone: contactPhone.numero,
      contactPhoneDdi: contactPhone.ddi,
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

  function collectFeeAndPendencias() {
    return {
      responseDeadline: responseDeadline || undefined,
      feeMode,
      feePercentual: feeMode !== "DINHEIRO" && feePercentual.trim() ? Number(feePercentual) : null,
      feePercentualBase: feeMode !== "DINHEIRO" ? feePercentualBase : undefined,
      pendencias: pendenciaRows.map((r) => ({
        direction: r.direction,
        kind: r.kind,
        description: r.description.trim() || undefined,
        responsibleId: r.responsibleId || undefined,
        dueDate: r.dueDate || undefined,
      })),
    };
  }

  function stageFiles(files: FileList) {
    const next: StagedAttachment[] = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      name: file.name,
      docType: "OUTRO",
    }));
    if (next.length === 0) return;
    setStagedAttachments((prev) => [...prev, ...next]);
    setDirty(true);
  }

  // Sobe os anexos em espera (Fase 5) DEPOIS que o atendimento já existe (attendanceId é
  // obrigatório para o Drive saber em que pasta guardar) — mesmo caminho de duas etapas de
  // components/AttachmentList.tsx (Blob do navegador -> Drive), um arquivo de cada vez, mostrando
  // progresso. Retorna os nomes que falharam (sem travar os demais).
  async function uploadStagedAttachments(attendanceId: string): Promise<string[]> {
    const failed: string[] = [];
    for (let i = 0; i < stagedAttachments.length; i++) {
      const att = stagedAttachments[i];
      setProgressText(`Enviando anexo ${i + 1} de ${stagedAttachments.length}: ${att.name}...`);
      try {
        const blob = await upload(att.file.name, att.file, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });
        const result = await finalizeAttachmentUpload({
          blobUrl: blob.url,
          name: att.name.trim() || att.file.name,
          contentType: att.file.type || "application/octet-stream",
          docType: att.docType,
          attendanceId,
        });
        if (result.error) failed.push(att.name);
      } catch {
        failed.push(att.name);
      }
    }
    return failed;
  }

  async function handleSaveDraft() {
    setLoading(true);
    setProgressText("Salvando rascunho...");
    setFormError("");
    try {
      await saveAttendanceDraft({ ...collectFieldsFromForm(), ...collectFeeAndPendencias() });
      setLoading(false);
      setProgressText("");
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (err) {
      setLoading(false);
      setProgressText("");
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar o rascunho. Tente novamente.");
    }
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
    setUploadWarnings([]);
    try {
      // Se já existe um atendimento criado (2ª tentativa, depois de algum anexo ter falhado no
      // envio), não cria outro — só retenta subir o que faltou.
      let attendanceId = createdAttendanceId;
      let newClientId: string | undefined;

      if (!attendanceId) {
        setProgressText("Salvando atendimento...");
        const result = await createAttendance({
          ...collectFieldsFromForm(),
          ...collectFeeAndPendencias(),
          isNewClient: clientMode === "novo",
        });
        attendanceId = result.id;
        newClientId = result.newClientId;
        setCreatedAttendanceId(result.id);
      }

      let failed: string[] = [];
      if (stagedAttachments.length > 0) {
        failed = await uploadStagedAttachments(attendanceId);
      }

      setLoading(false);
      setProgressText("");

      if (failed.length > 0) {
        // Não fecha sozinho quando algo falhou — o atendimento já existe (não se perde nada),
        // mas quem estava enviando precisa saber que tem anexo para reenviar (o botão vira
        // "Reenviar anexos" enquanto createdAttendanceId estiver preenchido).
        setUploadWarnings(failed);
        setStagedAttachments((prev) => prev.filter((a) => failed.includes(a.name)));
        return;
      }

      setOpen(false);
      if (newClientId) setQualification({ clientId: newClientId, attendanceId });
      resetForm();
      router.refresh();
    } catch (err) {
      setLoading(false);
      setProgressText("");
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar o atendimento. Tente novamente.");
    }
  }

  return (
    <>
      {/* "Novo" é Secundário (DESIGN-SYSTEM.md §4) — o azul de ação fica pro "Criar" dentro do modal. */}
      <button onClick={openFresh} className="flex items-center gap-1.5 bg-sf border border-regua hover:bg-sf-apoio text-tx text-sm font-medium px-3.5 py-2 transition-colors">
        <Plus size={16} /> Novo Atendimento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-[80vw] max-w-[1200px] h-[80vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Novo Atendimento</h3>
              <button onClick={handleCloseAttempt} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} onChange={() => setDirty(true)} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
                {formError && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-3 py-2">{formError}</p>}

                {uploadWarnings.length > 0 && (
                  <div className="flex items-start gap-2 text-xs text-aviso bg-aviso-bg rounded-md px-3 py-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Atendimento criado, mas {uploadWarnings.length} anexo(s) não foram enviados.</p>
                      <p>{uploadWarnings.join(", ")} — os arquivos continuam abaixo, prontos para tentar de novo.</p>
                    </div>
                  </div>
                )}

                <SecaoLancamento title="Contato" tone="palha">
                  <div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="text-xs font-medium text-tx-2">Nome do Contato</label>
                      <div className="flex gap-1 bg-sf-apoio p-0.5">
                        <button
                          type="button"
                          onClick={() => setClientMode("novo")}
                          className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${
                            clientMode === "novo"
                              ? "bg-sf text-tx"
                              : "text-tx-3 hover:text-tx"
                          }`}
                        >
                          Cadastrar novo cliente
                        </button>
                        <button
                          type="button"
                          onClick={() => setClientMode("selecionar")}
                          className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${
                            clientMode === "selecionar"
                              ? "bg-sf text-tx"
                              : "text-tx-3 hover:text-tx"
                          }`}
                        >
                          Selecionar cliente
                        </button>
                      </div>
                    </div>

                    {clientMode === "novo" ? (
                      <input
                        value={clientNameNovo}
                        onChange={(e) => setClientNameNovo(e.target.value)}
                        required
                        className="at-input"
                        placeholder="Nome completo"
                      />
                    ) : selectedClient ? (
                      <div className="at-input flex items-center justify-between bg-sf-apoio">
                        <span className="text-sm text-tx truncate">{selectedClient.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClient(null);
                            setClientQuery("");
                            setDirty(true);
                          }}
                          className="text-xs font-semibold text-acao hover:underline shrink-0 ml-2"
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
                          <div className="absolute z-10 left-0 right-0 mt-1 bg-sf border border-regua shadow-pop max-h-48 overflow-y-auto scrollbar-thin">
                            {searching && <p className="px-3 py-2 text-xs text-tx-3">Buscando...</p>}
                            {!searching && clientResults.length === 0 && (
                              <p className="px-3 py-2 text-xs text-tx-3">Nenhum cliente encontrado.</p>
                            )}
                            {!searching &&
                              clientResults.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => pickClient(c)}
                                  className="flex flex-col items-start w-full px-3 py-2 text-left hover:bg-sf-apoio transition-colors"
                                >
                                  <span className="text-sm text-tx">{c.name}</span>
                                  {(c.phone || c.email) && (
                                    <span className="text-xs text-tx-3">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                                  )}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {conflictMatches.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-aviso bg-aviso-bg rounded-md px-3 py-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Possível conflito de interesses</p>
                        <p>
                          Esse nome já aparece como parte adversa em:{" "}
                          {conflictMatches.map((m, i) => (
                            <span key={m.id}>
                              {i > 0 && ", "}
                              {m.title}
                              {m.processNumber ? ` (${m.processNumber})` : ""}
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-tx-2">Telefone</label>
                      <PhoneInput
                        name="contactPhone"
                        value={contactPhone}
                        onChange={(v) => {
                          setContactPhone(v);
                          setDirty(true);
                        }}
                        className="at-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">E-mail</label>
                      <input
                        name="clientEmail"
                        type="email"
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        className="at-input"
                        placeholder="cliente@exemplo.com"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Canal</label>
                      <select name="channel" className="at-input">
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="EMAIL">E-mail</option>
                        <option value="TELEFONE">Telefone</option>
                        <option value="PRESENCIAL">Presencial</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Origem do lead</label>
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
                    <div>
                      <label className="text-xs font-medium text-tx-2">Responsável pela triagem</label>
                      <select name="responsibleId" className="at-input">
                        <option value="">Não definido</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Próximo contato / follow-up</label>
                      <input name="nextContactAt" type="date" className="at-input" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Prazo de resposta ao lead</label>
                      <input
                        type="datetime-local"
                        value={responseDeadline}
                        onChange={(e) => setResponseDeadline(e.target.value)}
                        className="at-input"
                      />
                    </div>
                    <AssessoriaSelect assessorias={assessorias} inputClassName="at-input" defaultValue={defaultAssessoriaId} />
                  </div>
                  <p className="text-[11px] text-tx-3">
                    Lead sem retorno é lead perdido — a Central de Alertas avisa se o prazo acima estourar sem resposta.
                  </p>
                </SecaoLancamento>

                <SecaoLancamento title="Assunto e matéria" tone="azul">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-tx-2">Assunto (do que se trata)</label>
                      <input name="subject" required className="at-input" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-tx-2">Matéria</label>
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
                  </div>
                  <div>
                    <label className="text-xs font-medium text-tx-2">Descrição detalhada do que precisa</label>
                    <textarea name="description" rows={4} className="at-input resize-y max-h-[40vh]" />
                  </div>
                </SecaoLancamento>

                <SecaoLancamento title="Honorário pretendido" tone="ouro">
                  <Segmented<FeeMode>
                    value={feeMode}
                    onChange={setFeeMode}
                    options={[
                      { value: "DINHEIRO", label: "Dinheiro" },
                      { value: "PERCENTUAL", label: "Percentual" },
                      { value: "AMBOS", label: "Dinheiro + Percentual" },
                    ]}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {feeMode !== "PERCENTUAL" && (
                      <div>
                        <label className="text-xs font-medium text-tx-2">Valor em dinheiro (R$)</label>
                        <MoneyInput name="estimatedValue" className="at-input" />
                      </div>
                    )}
                    {feeMode !== "DINHEIRO" && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-tx-2">Percentual (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={feePercentual}
                            onChange={(e) => setFeePercentual(e.target.value)}
                            className="at-input"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-tx-2">Base do percentual</label>
                          <select
                            value={feePercentualBase}
                            onChange={(e) => setFeePercentualBase(e.target.value)}
                            className="at-input"
                          >
                            {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-tx-3">
                    Só uma intenção nesta fase — se o atendimento virar Processo, esses dados pré-preenchem (sem redigitar) a tela de Lançar
                    Honorários, mas a cobrança em si só é criada depois de você confirmar lá.
                  </p>
                </SecaoLancamento>

                <SecaoLancamento title="Pendências" tone="rosa">
                  <PendenciasEditor rows={pendenciaRows} onChange={setPendenciaRows} users={users} />
                </SecaoLancamento>

                <SecaoLancamento title="Anexos" tone="verde">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      if (e.dataTransfer.files?.length) stageFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed p-4 cursor-pointer transition-colors ${
                      dragOver ? "border-acao bg-acao-bg" : "border-regua-forte hover:border-acao hover:bg-sf-apoio"
                    }`}
                  >
                    <UploadCloud size={20} className="text-tx-3" />
                    <p className="text-xs text-tx-2 text-center">
                      Arraste um ou mais arquivos aqui, ou clique para selecionar do computador
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) stageFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  {stagedAttachments.length > 0 && (
                    <div className="space-y-2">
                      {stagedAttachments.map((att) => (
                        <div key={att.key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 bg-sf-apoio border border-regua">
                          <input
                            value={att.name}
                            onChange={(e) =>
                              setStagedAttachments((prev) => prev.map((a) => (a.key === att.key ? { ...a, name: e.target.value } : a)))
                            }
                            className="flex-1 text-sm border border-regua-forte bg-sf text-tx px-2.5 py-1.5"
                          />
                          <DocumentTypeSelect
                            value={att.docType}
                            onChange={(v) => setStagedAttachments((prev) => prev.map((a) => (a.key === att.key ? { ...a, docType: v } : a)))}
                            excludeKeys={["PARECER"]}
                            allowCreate
                            className="text-sm border border-regua-forte bg-sf text-tx px-2.5 py-1.5 sm:max-w-[220px]"
                          />
                          <button
                            type="button"
                            onClick={() => setStagedAttachments((prev) => prev.filter((a) => a.key !== att.key))}
                            className="shrink-0 text-tx-3 hover:text-vinho self-end sm:self-center"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-tx-3">
                    Os arquivos só sobem para a pasta do atendimento no Drive depois que ele é criado — o progresso aparece no rodapé desta
                    janela.
                  </p>
                </SecaoLancamento>
              </div>

              <div className="shrink-0 border-t border-regua px-5 py-3 flex items-center justify-between gap-4 flex-wrap bg-sf-apoio">
                <div className="min-w-0">
                  {loading && progressText ? (
                    <p className="text-xs font-semibold text-acao truncate">{progressText}</p>
                  ) : (
                    <p className="text-xs text-tx-3">
                      {pendenciaRows.length > 0 && `${pendenciaRows.length} pendência(s) · `}
                      {stagedAttachments.length > 0 && `${stagedAttachments.length} anexo(s) em espera`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseAttempt}
                    className="text-sm font-medium px-4 py-2 text-tx-2 hover:bg-sf-apoio"
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm px-5 py-2 disabled:opacity-50 transition-colors">
                    {loading ? "Salvando..." : createdAttendanceId ? "Reenviar anexos" : "Criar"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmClose && (
        <div className="fixed inset-0 z-[60] bg-grafite-900/60 flex items-center justify-center p-4">
          <div className="bg-sf shadow-pop w-full max-w-sm p-5 space-y-4">
            <p className="text-sm font-medium text-tx">Deseja salvar o rascunho deste atendimento e continuar depois?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={loading}
                className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2 disabled:opacity-50 transition-colors"
              >
                {loading ? "Salvando..." : "Salvar rascunho"}
              </button>
              {/* Descartar é destrutivo (DESIGN-SYSTEM.md §4: fundo —, texto --vinho). */}
              <button onClick={handleDiscard} className="w-full text-vinho text-sm font-semibold py-2 hover:bg-sf-apoio">
                Descartar
              </button>
              <button onClick={() => setConfirmClose(false)} className="w-full text-xs font-semibold text-tx-3 hover:text-tx py-1">
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
        .at-input {
          width: 100%;
          margin-top: 0.25rem;
          border: 1px solid var(--regua-forte);
          border-radius: 0.3125rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          background: var(--sf-superficie);
          color: var(--tx);
        }
        .at-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px var(--acao-bg);
        }
        .at-input::placeholder {
          color: var(--tx-3);
        }
      `}</style>
    </>
  );
}
