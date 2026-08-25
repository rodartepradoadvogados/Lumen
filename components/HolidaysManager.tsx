"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { createHoliday, updateHoliday, deleteHoliday } from "@/lib/actions/settings";
import { feriadosNacionais } from "@/lib/prazos";
import { formatCalendarDate } from "@/components/ui";

const SCOPE_LABELS: Record<string, string> = {
  ESTADUAL: "Estadual",
  MUNICIPAL: "Municipal",
  FORENSE: "Forense",
};

type Holiday = {
  id: string;
  date: string; // "YYYY-MM-DD"
  name: string;
  scope: string;
};

function Fields({ defaults }: { defaults?: Partial<Holiday> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <input name="date" type="date" defaultValue={defaults?.date ?? ""} required className="cfg-input bg-sf border border-regua text-tx" />
      <input
        name="name"
        defaultValue={defaults?.name ?? ""}
        required
        placeholder="Nome do feriado"
        className="cfg-input sm:col-span-2 bg-sf border border-regua text-tx placeholder:text-tx-3"
      />
      <select name="scope" defaultValue={defaults?.scope ?? "FORENSE"} className="cfg-input bg-sf border border-regua text-tx">
        {Object.entries(SCOPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function HolidayRow({ holiday }: { holiday: Holiday }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateHoliday(holiday.id, {
        date: String(formData.get("date") || ""),
        name: String(formData.get("name") || ""),
        scope: String(formData.get("scope") || "FORENSE"),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Excluir o feriado "${holiday.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteHoliday(holiday.id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <form action={handleSave} className="px-5 py-3 space-y-2 bg-sf-apoio">
        <Fields defaults={holiday} />
        {error && <p className="text-[11px] text-urgente bg-urgente-bg rounded-md px-2.5 py-1.5">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 text-xs font-semibold text-tx-2 hover:text-tx">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="text-xs font-mono text-tx-2 w-24 shrink-0">{formatCalendarDate(holiday.date)}</span>
      <p className="text-sm text-tx flex-1 min-w-0 truncate">{holiday.name}</p>
      <span className="text-[11px] font-semibold text-tx-2 shrink-0">{SCOPE_LABELS[holiday.scope] ?? holiday.scope}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setEditing(true)} data-tip="Editar" className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio">
          <Pencil size={14} />
        </button>
        <button onClick={handleDelete} disabled={pending} data-tip="Excluir" className="p-1.5 text-tx-3 hover:text-atencao hover:bg-atencao/10 disabled:opacity-40">
          <Trash2 size={14} />
        </button>
      </div>
      {error && <p className="text-[11px] text-urgente">{error}</p>}
    </div>
  );
}

export default function HolidaysManager({ holidays }: { holidays: Holiday[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createHoliday({
        date: String(formData.get("date") || ""),
        name: String(formData.get("name") || ""),
        scope: String(formData.get("scope") || "FORENSE"),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setAdding(false);
      router.refresh();
    });
  }

  const anoAtual = new Date().getFullYear();
  const nacionais = feriadosNacionais(anoAtual);

  return (
    <div>
      <div className="divide-y divide-regua">
        {holidays.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-tx-3">Nenhum feriado local cadastrado ainda.</p>
        )}
        {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
          <HolidayRow key={h.id} holiday={h} />
        ))}
      </div>
      {adding ? (
        <form action={handleCreate} className="p-5 space-y-2 border-t border-regua bg-sf-apoio">
          <Fields />
          {error && <p className="text-[11px] text-urgente bg-urgente-bg rounded-md px-2.5 py-1.5">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 text-xs font-semibold text-tx-2 hover:text-tx">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 border-t border-regua">
          <button onClick={() => setAdding(true)} className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2">
            Novo feriado local
          </button>
        </div>
      )}

      <div className="border-t border-regua px-5 py-4">
        <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-1">
          Feriados nacionais de {anoAtual} (calculados automaticamente — não cadastre aqui)
        </p>
        <p className="text-[11px] text-tx-2 mb-3">
          Fixos por lei/calendário civil e móveis (Carnaval, Sexta-feira Santa, Corpus Christi, calculados a partir da Páscoa) —
          o cálculo de prazo em dias úteis já os considera sozinho, todo ano, sem precisar de cadastro. Só leitura.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {nacionais.map((f) => (
            <div key={f.date} className="flex items-center gap-2 text-xs py-0.5">
              <span className="font-mono text-tx-2 w-20 shrink-0">{formatCalendarDate(f.date)}</span>
              <span className="text-tx-2">{f.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
