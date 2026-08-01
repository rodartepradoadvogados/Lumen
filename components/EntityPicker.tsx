"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Plus, X, Check } from "lucide-react";
import { looseIncludes } from "@/lib/textNormalize";

type Option = { id: string; name: string };

/**
 * Seletor com janela suspensa de busca dinâmica (tema azul, para diferenciar
 * dos demais campos do formulário). Substitui um <select> simples quando a
 * lista pode ser longa (fornecedor, categoria, centro de custo, cliente,
 * processo). Opcionalmente permite cadastrar um novo item sem sair do form.
 */
export default function EntityPicker({
  name,
  options,
  defaultValue,
  placeholder = "Buscar...",
  emptyLabel = "Nenhum",
  addLabel,
  onQuickAdd,
  onChange,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  emptyLabel?: string;
  addLabel?: string;
  onQuickAdd?: (name: string) => Promise<{ id: string; name?: string; title?: string }>;
  // Opcional — só quem precisa reagir à escolha (ex.: LancarHonorariosModal carregando as bases
  // do processo escolhido) passa isto; todo uso existente ignora e continua 100% inalterado.
  onChange?: (id: string) => void;
}) {
  const [list, setList] = useState(options);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setList(options), [options]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const selectedLabel = list.find((o) => o.id === selected)?.name ?? "";
  const filtered = useMemo(() => {
    const q = query.trim();
    // Ignora acento/hífen/ponto/caixa na busca local (mesma tolerância da busca no servidor —
    // ver lib/textNormalize.ts), já que as opções aqui já vêm carregadas no cliente.
    if (!q) return list;
    return list.filter((o) => looseIncludes(o.name, q));
  }, [list, query]);

  function pick(id: string) {
    setSelected(id);
    setOpen(false);
    setQuery("");
    onChange?.(id);
  }

  async function handleAdd() {
    if (!newName.trim() || !onQuickAdd) return;
    setPending(true);
    const created = await onQuickAdd(newName.trim());
    const label = created.name || created.title || newName.trim();
    setList((l) => [...l, { id: created.id, name: label }].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(created.id);
    setNewName("");
    setAdding(false);
    setPending(false);
    setOpen(false);
    onChange?.(created.id);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm text-left bg-white dark:bg-navy-800 hover:border-blue-400 dark:hover:border-blue-400/60 transition-colors"
      >
        <span className={selectedLabel ? "text-navy-900 dark:text-cream-50 truncate" : "text-navy-800/40 dark:text-cream-50/40 truncate"}>{selectedLabel || emptyLabel}</span>
        <ChevronDown size={14} className={`shrink-0 text-navy-800/40 dark:text-cream-50/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Fundo azul de propósito (tema próprio deste seletor, ver comentário no topo do arquivo)
          — no escuro vira azul-marinho profundo com borda/realces em azul claro translúcido, o
          mesmo par bg+texto usado em badges do projeto (ver components/ui.tsx:badgeColors.blue),
          conferido também contra o remap do tema Tarde (`.dark.theme-tarde` em app/globals.css,
          que reescreve exatamente estas classes dark:bg-navy-950/dark:border-white, então o
          contraste seguinte continua legível nos três temas). */}
      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1.5 bg-white dark:bg-navy-950 rounded-xl border-2 border-blue-300 dark:border-blue-400/30 shadow-pop overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-400/10 border-b border-blue-200 dark:border-blue-400/20 p-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400 dark:text-blue-300" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-blue-200 dark:border-blue-400/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50 bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            <button
              type="button"
              onClick={() => pick("")}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-800/50 dark:text-cream-50/50 hover:bg-blue-50 dark:hover:bg-blue-400/10 transition-colors"
            >
              {emptyLabel}
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-navy-800/40 dark:text-cream-50/40">Nada encontrado{query && ` para "${query}"`}.</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className="flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-navy-900 dark:text-cream-50 hover:bg-blue-50 dark:hover:bg-blue-400/10 transition-colors"
              >
                <span className="truncate">{o.name}</span>
                {selected === o.id && <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />}
              </button>
            ))}
          </div>

          {onQuickAdd && (
            <div className="border-t border-blue-200 dark:border-blue-400/20 bg-blue-50/60 dark:bg-blue-400/10 p-2">
              {!adding ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-400/15 transition-colors"
                >
                  <Plus size={13} /> {addLabel ?? "Cadastrar novo"}
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAdd();
                      }
                    }}
                    autoFocus
                    placeholder={addLabel ?? "Nome"}
                    className="flex-1 text-sm rounded-lg border border-blue-300 dark:border-blue-400/30 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400/50 bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50"
                  />
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={pending}
                    className="px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {pending ? "..." : "OK"}
                  </button>
                  <button type="button" onClick={() => setAdding(false)} className="px-2 text-blue-700/60 dark:text-blue-300/70 hover:text-blue-900 dark:hover:text-blue-200">
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
