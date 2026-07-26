"use client";

import { useMemo, useState } from "react";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import { CATEGORIA_ORDER } from "@/lib/tribunaisCatalog";
import { Search, X } from "lucide-react";

// Modal de seleção do catálogo de tribunais — "janela suspensa" para escolher sigla/nome/
// sistema/link de uma vez, sem digitar tudo à mão. Mesmo padrão de modal fixo usado em
// StartActingModal.tsx (fixed inset-0 z-50 bg-navy-950/40 ... + stopPropagation no card).
export default function TribunalPickerModal({
  tribunais,
  onSelect,
  trigger,
}: {
  tribunais: TribunalCatalogEntry[];
  onSelect: (t: TribunalCatalogEntry) => void;
  trigger: React.ReactNode; // elemento clicável que abre o modal (button/span com onClick injetado)
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Agrupa por categoria respeitando CATEGORIA_ORDER (não ordem alfabética), e dentro de cada
  // grupo ordena por `ordem` — mesma lógica de agrupamento usada em GlobalSearch.tsx.
  const grupos = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const filtrados = termo
      ? tribunais.filter((t) => t.sigla.toLowerCase().includes(termo) || t.nome.toLowerCase().includes(termo))
      : tribunais;
    return CATEGORIA_ORDER.map((categoria) => ({
      categoria,
      itens: filtrados.filter((t) => t.categoria === categoria).sort((a, b) => a.ordem - b.ordem),
    })).filter((g) => g.itens.length > 0);
  }, [tribunais, search]);

  function handleSelect(t: TribunalCatalogEntry) {
    onSelect(t);
    setOpen(false);
    setSearch("");
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Selecionar tribunal</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/40 dark:text-cream-50/40 pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por sigla ou nome..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-navy-800/10 dark:border-white/15 bg-white dark:bg-navy-800 text-sm text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
                />
              </div>
            </div>

            <div className="overflow-y-auto scrollbar-thin px-2 pb-2">
              {grupos.length === 0 && <p className="px-3 py-4 text-sm text-navy-800/50 dark:text-cream-50/50">Nenhum tribunal encontrado.</p>}
              {grupos.map((g) => (
                <div key={g.categoria} className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">{g.categoria}</p>
                  {g.itens.map((t) => (
                    <button
                      key={t.sigla}
                      type="button"
                      onClick={() => handleSelect(t)}
                      className="flex flex-col items-start w-full rounded-lg px-3 py-2 text-left hover:bg-cream-100 dark:hover:bg-white/5 transition-colors"
                    >
                      <span className="text-sm">
                        <span className="font-bold text-navy-900 dark:text-cream-50">{t.sigla}</span>{" "}
                        <span className="text-navy-800/70 dark:text-cream-50/70">{t.nome}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
