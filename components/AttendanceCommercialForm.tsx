"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceCommercial } from "@/lib/actions/attendance";
import { formatCurrency, formatDate } from "@/components/ui";
import { Pencil } from "lucide-react";

const leadSourceLabels: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

export default function AttendanceCommercialForm({
  attendanceId,
  estimatedValue,
  leadSource,
  nextContactAt,
}: {
  attendanceId: string;
  estimatedValue: number | null;
  leadSource: string | null;
  nextContactAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const nextContactValue = nextContactAt ? nextContactAt.slice(0, 10) : "";

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-navy-800/50 uppercase tracking-wide">Comercial (Funil)</h4>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/50 hover:text-navy-900"
          >
            <Pencil size={12} /> Editar
          </button>
        </div>
        <Row label="Valor estimado" value={estimatedValue != null ? formatCurrency(estimatedValue) : null} />
        <Row label="Origem do lead" value={leadSource ? leadSourceLabels[leadSource] || leadSource : null} />
        <Row label="Próximo contato" value={nextContactAt ? formatDate(nextContactAt) : null} />
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        const rawValue = String(formData.get("estimatedValue") || "").trim();
        startTransition(async () => {
          await updateAttendanceCommercial(attendanceId, {
            estimatedValue: rawValue ? Number(rawValue) : null,
            leadSource: String(formData.get("leadSource") || ""),
            nextContactAt: String(formData.get("nextContactAt") || ""),
          });
          setEditing(false);
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <h4 className="text-xs font-semibold text-navy-800/50 uppercase tracking-wide">Comercial (Funil)</h4>
      <div>
        <label className="text-xs font-medium text-navy-800/60">Valor estimado (R$)</label>
        <input
          name="estimatedValue"
          type="number"
          step="0.01"
          min="0"
          defaultValue={estimatedValue ?? ""}
          className="acf-input"
          placeholder="0,00"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-navy-800/60">Origem do lead</label>
        <select name="leadSource" defaultValue={leadSource || ""} className="acf-input">
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
        <label className="text-xs font-medium text-navy-800/60">Próximo contato / follow-up</label>
        <input name="nextContactAt" type="date" defaultValue={nextContactValue} className="acf-input" />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-gold-600 hover:bg-gold-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-3 text-xs font-semibold text-navy-800/50 hover:text-navy-900"
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
    <div className="flex justify-between text-sm border-b border-navy-800/5 pb-2">
      <span className="text-navy-800/50">{label}</span>
      <span className="font-medium text-navy-900 text-right">{value || "—"}</span>
    </div>
  );
}
