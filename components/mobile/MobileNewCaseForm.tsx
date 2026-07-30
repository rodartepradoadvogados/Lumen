"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCaseMobile } from "@/lib/actions/cases";
import { FilePlus2 } from "lucide-react";
import ClientPicker from "@/components/ClientPicker";
import OpposingPartyFields from "@/components/OpposingPartyFields";
import AssessoriaSelect from "@/components/AssessoriaSelect";
import TribunalFields from "@/components/TribunalFields";
import NewCaseAttachmentsField from "@/components/NewCaseAttachmentsField";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";

const inputClass =
  "w-full mt-1 border border-navy-800/12 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const labelClass = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

const AREA_OPTIONS = [
  "Cível",
  "Trabalhista",
  "Tributário",
  "Família",
  "Sucessões",
  "Criminal",
  "Previdenciário",
  "Empresarial",
  "Consumidor",
  "Administrativo",
  "Outra",
];

type Client = { id: string; name: string };
type UserOption = { id: string; name: string };
type AssessoriaOption = { id: string; clientName: string };

export default function MobileNewCaseForm({
  clients,
  users,
  assessorias,
  tribunais,
  defaultType,
  defaultProcessNumber,
  driveConnected,
}: {
  clients: Client[];
  users: UserOption[];
  assessorias: AssessoriaOption[];
  tribunais: TribunalCatalogEntry[];
  defaultType: string;
  defaultProcessNumber: string;
  driveConnected: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [type, setType] = useState(defaultType);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Ver components/NewCaseAttachmentsField.tsx e components/SaveCaseButton.tsx — mesmo evento,
  // mesma correção: bloquear o envio enquanto algum anexo ainda está subindo pro Blob, pra não
  // criar o caso só com os que já tinham terminado a tempo (bug real: "só subiram 3 documentos").
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const handleUploading = (e: Event) => setAttachmentsUploading(Boolean((e as CustomEvent).detail?.uploading));
    form.addEventListener("lumen:attachments-uploading", handleUploading);
    return () => form.removeEventListener("lumen:attachments-uploading", handleUploading);
  }, []);

  async function handleSubmit(formData: FormData) {
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      setError("Preencha ao menos o título do caso.");
      return;
    }
    if (attachmentsUploading) {
      setError("Aguarde o envio dos anexos terminar antes de salvar.");
      return;
    }
    setError("");
    setLoading(true);
    let stagedAttachments: { blobUrl: string; name: string; contentType: string; docType?: string }[] = [];
    try {
      const raw = String(formData.get("stagedAttachments") || "");
      if (raw) stagedAttachments = JSON.parse(raw);
    } catch {
      stagedAttachments = [];
    }
    try {
      const result = await createCaseMobile({
        title,
        type: String(formData.get("type") || "JUDICIAL"),
        area: String(formData.get("area") || "") || undefined,
        processNumber: String(formData.get("processNumber") || "") || undefined,
        court: String(formData.get("court") || "") || undefined,
        caseValue: String(formData.get("caseValue") || "") || undefined,
        clientId: String(formData.get("clientId") || "") || undefined,
        newClientName: String(formData.get("newClientName") || "") || undefined,
        clientRole: String(formData.get("clientRole") || "") || undefined,
        opposingPartyName: String(formData.get("opposingPartyName") || "") || undefined,
        opposingPartyRole: String(formData.get("opposingPartyRole") || "") || undefined,
        opposingPartyDocument: String(formData.get("opposingPartyDocument") || "") || undefined,
        opposingPartyAddress: String(formData.get("opposingPartyAddress") || "") || undefined,
        responsibleId: String(formData.get("responsibleId") || "") || undefined,
        description: String(formData.get("description") || "") || undefined,
        assessoriaId: String(formData.get("assessoriaId") || "") || undefined,
        tribunalSigla: String(formData.get("tribunalSigla") || "") || undefined,
        tribunalNome: String(formData.get("tribunalNome") || "") || undefined,
        tribunalSistema: String(formData.get("tribunalSistema") || "") || undefined,
        tribunalLink: String(formData.get("tribunalLink") || "") || undefined,
        stagedAttachments,
      });
      router.push(`/m/processos/${result.id}${result.anexosComErro ? `?anexosFalhos=${result.anexosComErro}` : ""}`);
    } catch {
      setError("Não foi possível salvar o processo. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <div>
        <label className={labelClass}>Título do Caso</label>
        <input name="title" required className={inputClass} placeholder="Ex: Fulano de Tal x Empresa XYZ" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Tipo</label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            <option value="JUDICIAL">Judicial</option>
            <option value="EXTRAJUDICIAL">Extrajudicial</option>
            <option value="ATENDIMENTO">Atendimento</option>
            <option value="CONSULTIVO">Consultivo</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Área</label>
          <select name="area" defaultValue="" className={inputClass}>
            <option value="">Não definida</option>
            {AREA_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Número do Processo</label>
          <input name="processNumber" defaultValue={defaultProcessNumber} className={inputClass} placeholder="0000000-00.0000..." />
        </div>
        <div>
          <label className={labelClass}>Vara/Comarca</label>
          <input name="court" className={inputClass} />
        </div>
      </div>

      {/* Mesma posição relativa do formulário desktop: logo após Vara/Comarca */}
      <TribunalFields tribunais={tribunais} inputClassName={inputClass} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Valor da Causa (R$)</label>
          <input name="caseValue" type="number" step="0.01" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Responsável</label>
          <select name="responsibleId" defaultValue="" className={inputClass}>
            <option value="">Não definido</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <ClientPicker clients={clients} inputClassName={inputClass} />

      <OpposingPartyFields inputClassName={inputClass} />

      <AssessoriaSelect assessorias={assessorias} inputClassName={inputClass} />

      <div>
        <label className={labelClass}>Descrição / Observações</label>
        <textarea name="description" rows={3} className={inputClass} />
      </div>

      <NewCaseAttachmentsField driveConnected={driveConnected} />

      {error && <p className="text-xs font-semibold text-bordo-600 dark:text-bordo-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || attachmentsUploading}
        className="w-full flex items-center justify-center gap-1.5 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <FilePlus2 size={15} />{" "}
        {attachmentsUploading ? "Enviando anexos..." : loading ? "Salvando..." : type === "JUDICIAL" ? "Salvar Processo" : "Salvar Caso"}
      </button>
    </form>
  );
}
