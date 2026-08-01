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
      <input name="date" type="date" defaultValue={defaults?.date ?? ""} required className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50" />
      <input
        name="name"
        defaultValue={defaults?.name ?? ""}
        required
        placeholder="Nome do feriado"
        className="cfg-input sm:col-span-2 dark:bg-navy-900 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30"
      />
      <select name="scope" defaultValue={defaults?.scope ?? "FORENSE"} className="cfg-input dark:bg-navy-900 dark:border-white/15 dark:text-cream-50">
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
      <form action={handleSave} className="px-5 py-3 space-y-2 bg-cream-50 dark:bg-navy-800">
        <Fields defaults={holiday} />
        {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-2.5 py-1.5">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="text-xs font-mono text-navy-800/50 dark:text-cream-50/50 w-24 shrink-0">{formatCalendarDate(holiday.date)}</span>
      <p className="text-sm text-navy-900 dark:text-cream-50 flex-1 min-w-0 truncate">{holiday.name}</p>
      <span className="text-[11px] font-semibold text-navy-800/45 dark:text-cream-50/45 shrink-0">{SCOPE_LABELS[holiday.scope] ?? holiday.scope}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setEditing(true)} data-tip="Editar" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-navy-900 dark:hover:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/10">
          <Pencil size={14} />
        </button>
        <button onClick={handleDelete} disabled={pending} data-tip="Excluir" className="p-1.5 rounded-lg text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-50 dark:hover:bg-bordo-400/10 disabled:opacity-40">
          <Trash2 size={14} />
        </button>
      </div>
      {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400">{error}</p>}
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
      <div className="divide-y divide-navy-800/5 dark:divide-white/10">
        {holidays.length === 0 && !adding && (
          <p className="px-5 py-4 text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum feriado local cadastrado ainda.</p>
        )}
        {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
          <HolidayRow key={h.id} holiday={h} />
        ))}
      </div>
      {adding ? (
        <form action={handleCreate} className="p-5 space-y-2 border-t border-navy-800/8 dark:border-white/10 bg-cream-50 dark:bg-navy-800">
          <Fields />
          {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400 bg-bordo-100 dark:bg-bordo-400/15 rounded-lg px-2.5 py-1.5">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 border-t border-navy-800/8 dark:border-white/10">
          <button onClick={() => setAdding(true)} className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
            Novo feriado local
          </button>
        </div>
      )}

      <div className="border-t border-navy-800/8 dark:border-white/10 px-5 py-4">
        <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1">
          Feriados nacionais de {anoAtual} (calculados automaticamente — não cadastre aqui)
        </p>
        <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mb-3">
          Fixos por lei/calendário civil e móveis (Carnaval, Sexta-feira Santa, Corpus Christi, calculados a partir da Páscoa) —
          o cálculo de prazo em dias úteis já os considera sozinho, todo ano, sem precisar de cadastro. Só leitura.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {nacionais.map((f) => (
            <div key={f.date} className="flex items-center gap-2 text-xs py-0.5">
              <span className="font-mono text-navy-800/45 dark:text-cream-50/45 w-20 shrink-0">{formatCalendarDate(f.date)}</span>
              <span className="text-navy-800/70 dark:text-cream-50/70">{f.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
