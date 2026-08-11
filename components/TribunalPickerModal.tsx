"use client";

import { useMemo, useState } from "react";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import { CATEGORIA_ORDER } from "@/lib/tribunaisCatalog";
import { Search, X } from "lucide-react";

// Modal de seleção do catálogo de tribunais — "janela suspensa" para escolher sigla/nome/
// sistema/link de uma vez, sem digitar tudo à mão. Mesmo padrão de modal fixo usado em
// StartActingModal.tsx (fixed inset-0 z-50 bg-grafite-900/40 ... + stopPropagation no card).
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
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-serif font-bold text-tx">Selecionar tribunal</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3 pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por sigla ou nome..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-regua bg-sf text-sm text-tx placeholder:text-tx-3 focus:outline-none focus:ring-2 focus:ring-acao/40"
                />
              </div>
            </div>

            <div className="overflow-y-auto scrollbar-thin px-2 pb-2">
              {grupos.length === 0 && <p className="px-3 py-4 text-sm text-tx-2">Nenhum tribunal encontrado.</p>}
              {grupos.map((g) => (
                <div key={g.categoria} className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-tx-3 uppercase tracking-wide">{g.categoria}</p>
                  {g.itens.map((t) => (
                    <button
                      key={t.sigla}
                      type="button"
                      onClick={() => handleSelect(t)}
                      className="flex flex-col items-start w-full rounded-lg px-3 py-2 text-left hover:bg-sf-apoio transition-colors"
                    >
                      <span className="text-sm">
                        <span className="font-bold text-tx">{t.sigla}</span>{" "}
                        <span className="text-tx-2">{t.nome}</span>
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
