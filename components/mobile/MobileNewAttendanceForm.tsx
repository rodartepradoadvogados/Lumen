"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAttendance } from "@/lib/actions/attendance";
import PendenciasEditor, { type PendenciaRow } from "@/components/PendenciasEditor";
import { PERCENTUAL_BASE_LABELS } from "@/lib/honorarioLancamento";
import { Send } from "lucide-react";

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
// pendências) — só sem a área de anexos (o padrão mobile do projeto já resolve anexo na própria
// tela de detalhe do atendimento depois de criado, não na criação — ver app/m/atendimento/[id]).
// Motivo da perda não entra aqui: um atendimento recém-criado nunca nasce no estágio Perdido.
export default function MobileNewAttendanceForm({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responseDeadline, setResponseDeadline] = useState("");
  const [feeMode, setFeeMode] = useState("DINHEIRO");
  const [feePercentual, setFeePercentual] = useState("");
  const [feePercentualBase, setFeePercentualBase] = useState("VALOR_CAUSA");
  const [pendenciaRows, setPendenciaRows] = useState<PendenciaRow[]>([]);

  useEffect(() => {
    setResponseDeadline(toDatetimeLocal(new Date(Date.now() + 24 * 3600 * 1000)));
  }, []);

  async function handleSubmit(formData: FormData) {
    const clientName = String(formData.get("clientName") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    if (!clientName || !subject) {
      setError("Preencha ao menos o nome do contato e o assunto.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createAttendance({
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
      router.push("/m");
    } catch {
      setError("Não foi possível salvar o atendimento. Tente novamente.");
      setLoading(false);
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

      {error && <p className="text-xs font-semibold text-bordo-600 dark:text-bordo-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <Send size={15} /> {loading ? "Salvando..." : "Criar atendimento"}
      </button>
    </form>
  );
}
