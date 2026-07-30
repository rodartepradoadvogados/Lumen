"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

type Client = { id: string; name: string };
type Entry = { key: number; mode: "selecionar" | "novo"; clientId: string; newClientName: string; role: string };

export type ClientPickerInitial = { clientId?: string | null; clientName?: string; role?: string | null }[];

const CLIENT_ROLE_OPTIONS = ["Autor", "Réu", "Terceiro Interessado", "Recorrente", "Recorrido", "Outro"];

// Alterna entre selecionar um cliente já cadastrado e cadastrar um novo cliente inline, direto no
// formulário de Novo/Editar Processo — sem precisar sair para a tela de Clientes. Cada entrada
// vira um hidden input `clientEntries` com um JSON {clientId, newClientName, role} — o form pai
// (server action ou handler client-side) lê todos via formData.getAll("clientEntries") e faz
// JSON.parse de cada um. Suporta litisconsórcio: "+ Adicionar outro cliente" acrescenta mais uma
// entrada independente, cada uma com seu próprio modo (selecionar/novo) e papel.
export default function ClientPicker({
  clients,
  inputClassName,
  initial,
}: {
  clients: Client[];
  inputClassName: string;
  initial?: ClientPickerInitial;
}) {
  const counter = useRef(0);
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (initial && initial.length > 0) {
      return initial.map((i) => ({
        key: counter.current++,
        mode: i.clientId ? "selecionar" : "novo",
        clientId: i.clientId || "",
        newClientName: i.clientName || "",
        role: i.role || "",
      }));
    }
    counter.current += 1;
    return [{ key: 0, mode: "selecionar", clientId: "", newClientName: "", role: "" }];
  });

  function addEntry() {
    setEntries((es) => [...es, { key: counter.current++, mode: "selecionar", clientId: "", newClientName: "", role: "" }]);
  }
  function removeEntry(key: number) {
    setEntries((es) => (es.length > 1 ? es.filter((e) => e.key !== key) : es));
  }
  function update(key: number, patch: Partial<Entry>) {
    setEntries((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <div key={entry.key} className={idx > 0 ? "pt-3 border-t border-navy-800/8 dark:border-white/10" : ""}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">
              {idx === 0 ? "Cliente" : `Cliente ${idx + 1} (litisconsórcio)`}
            </label>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-1 bg-cream-100 dark:bg-navy-800 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => update(entry.key, { mode: "selecionar" })}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                    entry.mode === "selecionar"
                      ? "bg-white dark:bg-navy-950 shadow-sm text-navy-900 dark:text-cream-50"
                      : "text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
                  }`}
                >
                  Selecionar cliente
                </button>
                <button
                  type="button"
                  onClick={() => update(entry.key, { mode: "novo" })}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                    entry.mode === "novo"
                      ? "bg-white dark:bg-navy-950 shadow-sm text-navy-900 dark:text-cream-50"
                      : "text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
                  }`}
                >
                  Cadastrar novo cliente
                </button>
              </div>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEntry(entry.key)}
                  aria-label="Remover cliente"
                  className="p-1 text-navy-800/40 dark:text-cream-50/40 hover:text-bordo-600 dark:hover:text-bordo-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {entry.mode === "selecionar" ? (
            <select value={entry.clientId} onChange={(e) => update(entry.key, { clientId: e.target.value })} className={inputClassName}>
              <option value="">Selecionar cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={entry.newClientName}
              onChange={(e) => update(entry.key, { newClientName: e.target.value })}
              className={inputClassName}
              placeholder="Nome do novo cliente"
            />
          )}

          <div className="mt-2">
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Papel do cliente no processo</label>
            <select value={entry.role} onChange={(e) => update(entry.key, { role: e.target.value })} className={inputClassName}>
              <option value="">Não definido</option>
              {CLIENT_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <input
            type="hidden"
            name="clientEntries"
            value={JSON.stringify({
              clientId: entry.mode === "selecionar" ? entry.clientId : "",
              newClientName: entry.mode === "novo" ? entry.newClientName : "",
              role: entry.role,
            })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1.5 text-xs font-semibold text-navy-900 dark:text-cream-50 hover:text-gold-700 dark:hover:text-gold-400 transition-colors"
      >
        <Plus size={14} /> Adicionar outro cliente (litisconsórcio)
      </button>
    </div>
  );
}
