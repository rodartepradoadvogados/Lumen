"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

type Option = { id: string; name: string };

export default function QuickAddSelect({
  name,
  options,
  defaultValue,
  placeholder,
  addLabel,
  onQuickAdd,
  emptyLabel = "Nenhum",
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  addLabel: string;
  onQuickAdd: (name: string) => Promise<{ id: string; name?: string; title?: string }>;
  emptyLabel?: string;
}) {
  const [list, setList] = useState(options);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const created = await onQuickAdd(newName.trim());
      const label = created.name || created.title || newName.trim();
      setList((l) => [...l, { id: created.id, name: label }].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(created.id);
      setNewName("");
      setAdding(false);
    });
  }

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="fin-input flex-1"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending}
          className="px-2.5 rounded-lg bg-gold-600 hover:bg-gold-700 text-white text-xs font-semibold disabled:opacity-50"
        >
          {pending ? "..." : "OK"}
        </button>
        <button type="button" onClick={() => setAdding(false)} className="px-2 text-navy-800/40 hover:text-navy-900">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <select name={name} value={selected} onChange={(e) => setSelected(e.target.value)} className="fin-input flex-1">
        <option value="">{emptyLabel}</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        data-tip={addLabel}
        className="px-2 rounded-lg border border-navy-800/12 text-navy-800/60 hover:text-navy-900 hover:bg-cream-100"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
