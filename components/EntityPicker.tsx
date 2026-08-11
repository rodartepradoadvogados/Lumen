"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Plus, X, Check } from "lucide-react";
import { looseIncludes } from "@/lib/textNormalize";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

type Option = { id: string; name: string };

// Deriva um título de janela a partir do placeholder quando quem chama não passa `title`
// explícito ("Buscar fornecedor..." -> "Fornecedor") — mantém todo uso existente funcionando sem
// precisar editar cada chamada, só perde um pouco de capitalização em placeholders fora do padrão
// "Buscar X...", que voltam como estão (ainda legível, só não com a mesma polidez).
function titleFromPlaceholder(placeholder: string): string {
  const m = placeholder.match(/^Buscar (.+?)\.{0,3}$/i);
  if (!m) return placeholder;
  const words = m[1].split(" ");
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

/**
 * Seletor com janela suspensa (POP-UP central, tema azul, para diferenciar dos demais campos do
 * formulário) de busca dinâmica. Substitui um <select> simples quando a lista pode ser longa
 * (fornecedor, categoria, centro de custo, cliente, processo, responsável, tipo de documento).
 * Opcionalmente permite cadastrar um novo item sem sair do form.
 *
 * De propósito, um clique FORA da janela não fecha nada — só o X (ou Esc) fecham, mesmo padrão
 * dos demais modais do produto (NewPayableModal, EditReceivableModal etc.) e pedido explícito do
 * usuário: evita fechar sem querer no meio de uma busca ou de um cadastro rápido em andamento.
 */
export default function EntityPicker({
  name,
  options,
  defaultValue,
  title,
  placeholder = "Buscar...",
  emptyLabel = "Nenhum",
  addLabel,
  onQuickAdd,
  onChange,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  // Título da janela suspensa — quando ausente, deriva do placeholder ("Buscar fornecedor..." ->
  // "Fornecedor"); só vale a pena passar explícito quando o placeholder não segue esse padrão.
  title?: string;
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setList(options), [options]);

  useEscapeToClose(open, () => {
    setOpen(false);
    setAdding(false);
  });

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const selectedLabel = list.find((o) => o.id === selected)?.name ?? "";
  const windowTitle = title ?? titleFromPlaceholder(placeholder);
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
    <div className="relative">
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-2 border border-regua rounded-lg px-3 py-2 text-sm text-left bg-sf hover:border-blue-400 dark:hover:border-blue-400/60 transition-colors"
      >
        <span className={selectedLabel ? "text-tx truncate" : "text-tx-3 truncate"}>{selectedLabel || emptyLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-tx-3" />
      </button>

      {/* Pop-up central (fixed inset-0), não dropdown ancorado no campo — só fecha pelo X (ou
          Esc), nunca por clique fora, ver comentário no topo do arquivo. Fundo azul de propósito
          (tema próprio deste seletor) — no escuro vira azul-marinho profundo com borda/realces em
          azul claro translúcido, o mesmo par bg+texto usado em badges do projeto (ver
          components/ui.tsx:badgeColors.blue). z-[60]: acima dos modais de lançamento (z-50), já
          que este seletor sempre abre DE DENTRO de um deles. */}
      {open && (
        <div className="fixed inset-0 z-[60] bg-grafite-900/40 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm bg-sf rounded-xl border-2 border-blue-300 dark:border-blue-400/30 shadow-pop overflow-hidden flex flex-col max-h-[80vh]">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-400/10 border-b border-blue-200 dark:border-blue-400/20">
              <h3 className="font-serif font-bold text-sm text-tx">{windowTitle}</h3>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setAdding(false);
                }}
                className="text-blue-700/60 dark:text-blue-300/70 hover:text-blue-900 dark:hover:text-blue-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 p-2 border-b border-blue-200 dark:border-blue-400/20">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400 dark:text-blue-300" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-blue-200 dark:border-blue-400/30 focus:outline-none focus:ring-2 focus:ring-blue-400/50 bg-sf text-tx placeholder:text-tx-3"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-[3rem]">
              <button
                type="button"
                onClick={() => pick("")}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-tx-2 hover:bg-blue-50 dark:hover:bg-blue-400/10 transition-colors"
              >
                {emptyLabel}
              </button>
              {filtered.length === 0 && (
                <p className="px-3 py-3 text-xs text-tx-3">Nada encontrado{query && ` para "${query}"`}.</p>
              )}
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pick(o.id)}
                  className="flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-tx hover:bg-blue-50 dark:hover:bg-blue-400/10 transition-colors"
                >
                  <span className="truncate">{o.name}</span>
                  {selected === o.id && <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                </button>
              ))}
            </div>

            {onQuickAdd && (
              <div className="shrink-0 border-t border-blue-200 dark:border-blue-400/20 bg-blue-50/60 dark:bg-blue-400/10 p-2">
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
                      className="flex-1 text-sm rounded-lg border border-blue-300 dark:border-blue-400/30 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400/50 bg-sf text-tx"
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
        </div>
      )}
    </div>
  );
}
