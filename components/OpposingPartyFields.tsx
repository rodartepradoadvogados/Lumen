"use client";

import { useRef, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";

type Entry = { key: number; name: string; document: string; role: string; address: string };

export type OpposingPartyInitial = { name: string; document?: string | null; address?: string | null; role?: string | null }[];

const ROLE_OPTIONS = [
  { value: "", label: "Polo não definido" },
  { value: "AUTOR", label: "Autor" },
  { value: "REU", label: "Réu" },
  { value: "TERCEIRO_INTERESSADO", label: "Terceiro Interessado" },
  { value: "OUTRO", label: "Outro" },
];

// Cadastro da parte adversa/terceiro interessado: só aparece expandido quando o usuário clica,
// já que a maioria dos casos só precisa de uma parte. Suporta litisconsórcio: "+ Adicionar outra
// parte" acrescenta mais uma entrada independente. Cada entrada vira um hidden input
// `partyEntries` com JSON {name, document, role, address} — o form pai lê todos via
// formData.getAll("partyEntries").
export default function OpposingPartyFields({
  inputClassName,
  initial,
}: {
  inputClassName: string;
  initial?: OpposingPartyInitial;
}) {
  const counter = useRef(0);
  const hasInitial = Boolean(initial && initial.length > 0);
  const [open, setOpen] = useState(hasInitial);
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (initial && initial.length > 0) {
      return initial.map((p) => ({
        key: counter.current++,
        name: p.name,
        document: p.document || "",
        role: p.role || "",
        address: p.address || "",
      }));
    }
    counter.current += 1;
    return [{ key: 0, name: "", document: "", role: "", address: "" }];
  });

  function addEntry() {
    setEntries((es) => [...es, { key: counter.current++, name: "", document: "", role: "", address: "" }]);
  }
  function removeEntry(key: number) {
    setEntries((es) => (es.length > 1 ? es.filter((e) => e.key !== key) : es));
  }
  function update(key: number, patch: Partial<Entry>) {
    setEntries((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-navy-900 dark:text-cream-50 hover:text-gold-700 dark:hover:text-gold-400 transition-colors"
      >
        <UserPlus size={14} /> Cadastrar parte adversa
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <div key={entry.key} className={idx > 0 ? "pt-3 border-t border-navy-800/8 dark:border-white/10" : ""}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">
              {idx === 0 ? "Parte Adversa / Terceiro Interessado" : `Parte ${idx + 1}`}
            </label>
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(entry.key)}
                aria-label="Remover parte"
                className="p-1 text-navy-800/40 dark:text-cream-50/40 hover:text-bordo-600 dark:hover:text-bordo-400"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <input
              value={entry.name}
              onChange={(e) => update(entry.key, { name: e.target.value })}
              className={inputClassName + " sm:col-span-2"}
              placeholder="Nome"
            />
            <input
              value={entry.document}
              onChange={(e) => update(entry.key, { document: e.target.value })}
              className={inputClassName}
              placeholder="CPF/CNPJ (opcional)"
            />
            <select value={entry.role} onChange={(e) => update(entry.key, { role: e.target.value })} className={inputClassName}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              value={entry.address}
              onChange={(e) => update(entry.key, { address: e.target.value })}
              className={inputClassName + " sm:col-span-2"}
              placeholder="Endereço (opcional)"
            />
          </div>
          <input
            type="hidden"
            name="partyEntries"
            value={JSON.stringify({ name: entry.name, document: entry.document, role: entry.role, address: entry.address })}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1.5 text-xs font-semibold text-navy-900 dark:text-cream-50 hover:text-gold-700 dark:hover:text-gold-400 transition-colors"
        >
          <Plus size={14} /> Adicionar outra parte
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setEntries([{ key: counter.current++, name: "", document: "", role: "", address: "" }]);
          }}
          className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
        >
          Remover todas
        </button>
      </div>
    </div>
  );
}
