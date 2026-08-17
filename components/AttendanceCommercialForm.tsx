"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceCommercial, markAttendanceResponded } from "@/lib/actions/attendance";
import { formatCurrency, formatDate } from "@/components/ui";
import { PERCENTUAL_BASE_LABELS } from "@/lib/honorarioLancamento";
import { Pencil, CheckCircle2 } from "lucide-react";
import MoneyInput from "@/components/MoneyInput";

const leadSourceLabels: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

const feeModeLabels: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PERCENTUAL: "Percentual",
  AMBOS: "Dinheiro + Percentual",
};

function feeSummary(feeMode: string | null, estimatedValue: number | null, feePercentual: number | null, feePercentualBase: string | null): string | null {
  if (!feeMode) return null;
  const parts: string[] = [];
  if (feeMode !== "PERCENTUAL" && estimatedValue != null) parts.push(formatCurrency(estimatedValue));
  if (feeMode !== "DINHEIRO" && feePercentual != null) {
    parts.push(`${feePercentual}% (${feePercentualBase ? PERCENTUAL_BASE_LABELS[feePercentualBase] ?? feePercentualBase : "base não definida"})`);
  }
  return parts.length > 0 ? `${feeModeLabels[feeMode] ?? feeMode}: ${parts.join(" + ")}` : feeModeLabels[feeMode] ?? feeMode;
}

// Formata Date para <input type="datetime-local"> no fuso local.
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AttendanceCommercialForm({
  attendanceId,
  estimatedValue,
  leadSource,
  nextContactAt,
  feeMode,
  feePercentual,
  feePercentualBase,
  responseDeadline,
  firstResponseAt,
}: {
  attendanceId: string;
  estimatedValue: number | null;
  leadSource: string | null;
  nextContactAt: string | null;
  feeMode: string | null;
  feePercentual: number | null;
  feePercentualBase: string | null;
  responseDeadline: string | null;
  firstResponseAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feeModeEdit, setFeeModeEdit] = useState(feeMode || "DINHEIRO");

  const nextContactValue = nextContactAt ? nextContactAt.slice(0, 10) : "";
  const responseDeadlineOverdue = responseDeadline && !firstResponseAt && new Date(responseDeadline) < new Date();

  function handleMarkResponded() {
    startTransition(async () => {
      await markAttendanceResponded(attendanceId);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Comercial (Funil)</h4>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx"
          >
            <Pencil size={12} /> Editar
          </button>
        </div>
        <Row label="Honorário pretendido" value={feeSummary(feeMode, estimatedValue, feePercentual, feePercentualBase)} />
        <Row label="Origem do lead" value={leadSource ? leadSourceLabels[leadSource] || leadSource : null} />
        <Row label="Próximo contato" value={nextContactAt ? formatDate(nextContactAt) : null} />
        <div className="flex justify-between text-sm border-b border-regua pb-2">
          <span className="text-tx-2">Prazo de resposta ao lead</span>
          <span className={`font-medium text-right ${responseDeadlineOverdue ? "text-urgente" : "text-tx"}`}>
            {responseDeadline ? `${formatDate(responseDeadline)} ${new Date(responseDeadline).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "—"}
          </span>
        </div>
        {firstResponseAt ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={13} /> Respondido em {formatDate(firstResponseAt)}{" "}
            {new Date(firstResponseAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : (
          <button
            onClick={handleMarkResponded}
            disabled={pending}
            className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50"
          >
            {pending ? "Marcando..." : "Marcar como respondido"}
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        const rawValue = String(formData.get("estimatedValue") || "").trim();
        const rawPercentual = String(formData.get("feePercentual") || "").trim();
        const rawDeadline = String(formData.get("responseDeadline") || "").trim();
        startTransition(async () => {
          await updateAttendanceCommercial(attendanceId, {
            estimatedValue: rawValue ? Number(rawValue) : null,
            leadSource: String(formData.get("leadSource") || ""),
            nextContactAt: String(formData.get("nextContactAt") || ""),
            feeMode: feeModeEdit,
            feePercentual: feeModeEdit !== "DINHEIRO" && rawPercentual ? Number(rawPercentual) : null,
            feePercentualBase: feeModeEdit !== "DINHEIRO" ? String(formData.get("feePercentualBase") || "VALOR_CAUSA") : null,
            responseDeadline: rawDeadline || null,
          });
          setEditing(false);
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <h4 className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Comercial (Funil)</h4>

      <div>
        <label className="text-xs font-medium text-tx-2">Forma de cobrança pretendida</label>
        <select value={feeModeEdit} onChange={(e) => setFeeModeEdit(e.target.value)} className="acf-input bg-sf border border-regua text-tx">
          <option value="DINHEIRO">Dinheiro</option>
          <option value="PERCENTUAL">Percentual</option>
          <option value="AMBOS">Dinheiro + Percentual</option>
        </select>
      </div>
      {feeModeEdit !== "PERCENTUAL" && (
        <div>
          <label className="text-xs font-medium text-tx-2">Valor em dinheiro (R$)</label>
          <MoneyInput
            name="estimatedValue"
            defaultValue={estimatedValue != null ? String(estimatedValue) : undefined}
            className="acf-input bg-sf border border-regua text-tx"
          />
        </div>
      )}
      {feeModeEdit !== "DINHEIRO" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-tx-2">Percentual (%)</label>
            <input
              name="feePercentual"
              type="number"
              step="0.01"
              min="0"
              defaultValue={feePercentual ?? ""}
              className="acf-input bg-sf border border-regua text-tx"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2">Base</label>
            <select name="feePercentualBase" defaultValue={feePercentualBase || "VALOR_CAUSA"} className="acf-input bg-sf border border-regua text-tx">
              {Object.entries(PERCENTUAL_BASE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-tx-2">Origem do lead</label>
        <select name="leadSource" defaultValue={leadSource || ""} className="acf-input bg-sf border border-regua text-tx">
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
        <label className="text-xs font-medium text-tx-2">Próximo contato / follow-up</label>
        <input name="nextContactAt" type="date" defaultValue={nextContactValue} className="acf-input bg-sf border border-regua text-tx" />
      </div>
      <div>
        <label className="text-xs font-medium text-tx-2">Prazo de resposta ao lead</label>
        <input
          name="responseDeadline"
          type="datetime-local"
          defaultValue={toDatetimeLocal(responseDeadline)}
          className="acf-input bg-sf border border-regua text-tx"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
        >
          Cancelar
        </button>
      </div>
      <style jsx global>{`
        .acf-input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .acf-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </form>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between text-sm border-b border-regua pb-2">
      <span className="text-tx-2">{label}</span>
      <span className="font-medium text-tx text-right">{value || "—"}</span>
    </div>
  );
}
