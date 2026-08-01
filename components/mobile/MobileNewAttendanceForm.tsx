"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { createAttendance } from "@/lib/actions/attendance";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import PendenciasEditor, { type PendenciaRow } from "@/components/PendenciasEditor";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { PERCENTUAL_BASE_LABELS } from "@/lib/honorarioLancamento";
import { Send, UploadCloud, X, AlertTriangle } from "lucide-react";

type StagedAttachment = { key: string; file: File; name: string; docType: string };

const inputClass =
  "w-full mt-1 border border-navy-800/12 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const labelClass = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Formulário compacto de atendimento rápido para o app mobile. Sempre cria um atendimento
// "de nome livre" (sem clientId/isNewClient) — comportamento mínimo equivalente ao que
// existia antes do NewAttendanceModal do desktop ganhar o fluxo de seleção/cadastro de cliente.
// Fase 5: ganhou os mesmos campos novos do desktop (prazo de resposta, honorário pretendido,
// pendências, anexos com progresso de envio — mesmo mecanismo de duas etapas do
// NewAttendanceModal: 1) cria o atendimento, 2) sobe os anexos em espera um a um mostrando
// progresso, já que o Drive exige um attendanceId que só existe depois do Create).
// Motivo da perda não entra aqui: um atendimento recém-criado nunca nasce no estágio Perdido.
export default function MobileNewAttendanceForm({
  users,
  driveConnected,
}: {
  users: { id: string; name: string }[];
  driveConnected: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [responseDeadline, setResponseDeadline] = useState("");
  const [feeMode, setFeeMode] = useState("DINHEIRO");
  const [feePercentual, setFeePercentual] = useState("");
  const [feePercentualBase, setFeePercentualBase] = useState("VALOR_CAUSA");
  const [pendenciaRows, setPendenciaRows] = useState<PendenciaRow[]>([]);

  // Anexos ficam "em espera" (File no navegador) até o atendimento ser criado — ver
  // uploadStagedAttachments/handleSubmit, mesmo fluxo do NewAttendanceModal desktop.
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guarda o id assim que o atendimento é criado — se o upload de algum anexo falhar e o usuário
  // tocar em "Reenviar anexos" de novo, o submit precisa só retentar o que faltou, sem criar um
  // segundo atendimento duplicado.
  const [createdAttendanceId, setCreatedAttendanceId] = useState<string | null>(null);

  useEffect(() => {
    setResponseDeadline(toDatetimeLocal(new Date(Date.now() + 24 * 3600 * 1000)));
  }, []);

  function stageFiles(files: FileList) {
    const next: StagedAttachment[] = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      name: file.name,
      docType: "OUTRO",
    }));
    if (next.length === 0) return;
    setStagedAttachments((prev) => [...prev, ...next]);
  }

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

  async function handleSubmit(formData: FormData) {
    const clientName = String(formData.get("clientName") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    if (!clientName || !subject) {
      setError("Preencha ao menos o nome do contato e o assunto.");
      return;
    }
    setError("");
    setUploadWarnings([]);
    setLoading(true);
    try {
      // Se já existe um atendimento criado (2ª tentativa, depois de algum anexo ter falhado no
      // envio), não cria outro — só retenta subir o que faltou.
      let attendanceId = createdAttendanceId;
      if (!attendanceId) {
        setProgressText("Salvando atendimento...");
        const result = await createAttendance({
          clientName,
          contactPhone: String(formData.get("contactPhone") || "") || undefined,
          clientEmail: String(formData.get("clientEmail") || "") || undefined,
          subject,
          area: String(formData.get("area") || "") || undefined,
          channel: String(formData.get("channel") || "WHATSAPP"),
          estimatedValue: feeMode !== "PERCENTUAL" ? Number(formData.get("estimatedValue") || 0) || null : null,
          responseDeadline: responseDeadline || undefined,
          feeMode,
          feePercentual: feeMode !== "DINHEIRO" && feePercentual ? Number(feePercentual) : null,
          feePercentualBase: feeMode !== "DINHEIRO" ? feePercentualBase : undefined,
          pendencias: pendenciaRows.map((r) => ({
            direction: r.direction,
            kind: r.kind,
            description: r.description.trim() || undefined,
            responsibleId: r.responsibleId || undefined,
            dueDate: r.dueDate || undefined,
          })),
        });
        attendanceId = result.id;
        setCreatedAttendanceId(result.id);
      }

      let failed: string[] = [];
      if (stagedAttachments.length > 0) {
        failed = await uploadStagedAttachments(attendanceId);
      }

      setLoading(false);
      setProgressText("");

      if (failed.length > 0) {
        // Não navega sozinho quando algo falhou — o atendimento já existe (não se perde nada),
        // mas quem estava enviando precisa saber que tem anexo para reenviar.
        setUploadWarnings(failed);
        setStagedAttachments((prev) => prev.filter((a) => failed.includes(a.name)));
        return;
      }

      router.push("/m");
    } catch {
      setError("Não foi possível salvar o atendimento. Tente novamente.");
      setLoading(false);
      setProgressText("");
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <div>
        <label className={labelClass}>Nome do contato</label>
        <input name="clientName" required className={inputClass} placeholder="Nome completo" />
      </div>

      <div>
        <label className={labelClass}>Assunto</label>
        <input name="subject" required className={inputClass} placeholder="Do que se trata" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Telefone</label>
          <input name="contactPhone" className={inputClass} placeholder="(00) 00000-0000" />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input name="clientEmail" type="email" className={inputClass} placeholder="cliente@exemplo.com" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Canal</label>
          <select name="channel" defaultValue="WHATSAPP" className={inputClass}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">E-mail</option>
            <option value="TELEFONE">Telefone</option>
            <option value="PRESENCIAL">Presencial</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Matéria</label>
          <select name="area" defaultValue="" className={inputClass}>
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
        <label className={labelClass}>Prazo de resposta ao lead</label>
        <input
          type="datetime-local"
          value={responseDeadline}
          onChange={(e) => setResponseDeadline(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="border-t border-navy-800/8 dark:border-white/10 pt-3">
        <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">Honorário pretendido</p>
        <div className="flex gap-1.5 mb-2">
          {(["DINHEIRO", "PERCENTUAL", "AMBOS"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFeeMode(m)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                feeMode === m
                  ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                  : "bg-white dark:bg-navy-900 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15"
              }`}
            >
              {m === "DINHEIRO" ? "Dinheiro" : m === "PERCENTUAL" ? "Percentual" : "Ambos"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {feeMode !== "PERCENTUAL" && (
            <div>
              <label className={labelClass}>Valor (R$)</label>
              <input name="estimatedValue" type="number" step="0.01" min="0" className={inputClass} placeholder="0,00" />
            </div>
          )}
          {feeMode !== "DINHEIRO" && (
            <>
              <div>
                <label className={labelClass}>Percentual (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={feePercentual}
                  onChange={(e) => setFeePercentual(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Base</label>
                <select value={feePercentualBase} onChange={(e) => setFeePercentualBase(e.target.value)} className={inputClass}>
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
      </div>

      <div className="border-t border-navy-800/8 dark:border-white/10 pt-3">
        <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">Pendências</p>
        <PendenciasEditor rows={pendenciaRows} onChange={setPendenciaRows} users={users} compact />
      </div>

      <div className="border-t border-navy-800/8 dark:border-white/10 pt-3">
        <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-2">Anexos</p>

        {!driveConnected ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg px-2.5 py-1.5">
            Drive ainda não conectado. Peça a um administrador para conectar em Configurações — depois de criar o atendimento,
            você ainda pode anexar documentos pelo computador.
          </p>
        ) : (
          <>
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
              className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
                dragOver
                  ? "border-gold-500 bg-gold-500/5"
                  : "border-navy-800/15 dark:border-white/15 hover:border-gold-500/40 hover:bg-cream-50 dark:hover:bg-white/5"
              }`}
            >
              <UploadCloud size={18} className="text-navy-800/40 dark:text-cream-50/40" />
              <p className="text-xs text-navy-800/60 dark:text-cream-50/60 text-center">
                Toque para escolher um ou mais arquivos
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
              <div className="mt-2 space-y-2">
                {stagedAttachments.map((att) => (
                  <div
                    key={att.key}
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10"
                  >
                    <span className="flex-1 min-w-0 text-xs font-medium text-navy-900 dark:text-cream-50 truncate" title={att.name}>
                      {att.name}
                    </span>
                    <DocumentTypeSelect
                      value={att.docType}
                      onChange={(v) => setStagedAttachments((prev) => prev.map((a) => (a.key === att.key ? { ...a, docType: v } : a)))}
                      excludeKeys={["PARECER"]}
                      className="text-[11px] border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded px-1.5 py-1 max-w-[140px] shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => setStagedAttachments((prev) => prev.filter((a) => a.key !== att.key))}
                      className="shrink-0 text-navy-800/40 dark:text-cream-50/40 hover:text-bordo-600 dark:hover:text-bordo-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1.5">
              Os arquivos só sobem para a pasta do atendimento no Drive depois que ele é criado.
            </p>
          </>
        )}
      </div>

      {uploadWarnings.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Atendimento criado, mas {uploadWarnings.length} anexo(s) não foram enviados.</p>
            <p>{uploadWarnings.join(", ")} — os arquivos continuam acima, prontos para tentar de novo.</p>
          </div>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-bordo-600 dark:text-bordo-400">{error}</p>}

      {loading && progressText && (
        <p className="text-xs font-semibold text-gold-700 dark:text-gold-400">{progressText}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <Send size={15} /> {loading ? "Salvando..." : createdAttendanceId ? "Reenviar anexos" : "Criar atendimento"}
      </button>
    </form>
  );
}
