"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
import { DOCUMENT_TYPE_GROUPS, LEGACY_DOCUMENT_TYPES, getDocumentType, type DocumentType } from "@/lib/documentTypes";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Normaliza pra comparar sem diferenciar maiúsc/minúsc/acento (ex.: "peticao" encontra "Petição").
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Antes era um <select> nativo (lista suspensa simples); virou uma janela suspensa (modal) com
// busca porque o catálogo de lib/documentTypes.ts já passou de 70 tipos — rolar um <select> nativo
// gigante era o principal problema reportado. A API pública (value/onChange/className/allowAll/
// includeLegacy/excludeKeys/name) fica igual à do <select> antigo de propósito: todo lugar que já
// usa este componente (Anexos de Processo/Atendimento em AttachmentList.tsx, e o catálogo de
// Documentos da Assessoria em AssessoriaDocumentosTab.tsx) ganha a janela suspensa automaticamente,
// sem precisar mudar nada na tela que chama.
export default function DocumentTypeSelect({
  value,
  onChange,
  className,
  allowAll,
  includeLegacy,
  excludeKeys,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  allowAll?: boolean;
  includeLegacy?: boolean;
  // Tipos que não fazem sentido neste contexto (ex.: "Parecer" na Assessoria, que já tem
  // campo próprio para isso, então não deve aparecer de novo como tipo de anexo genérico).
  excludeKeys?: string[];
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const currentLabel = value === "TODOS" ? "Todos os tipos" : getDocumentType(value).label;

  // Grupos na mesma ordem curada de DOCUMENT_TYPE_GROUPS (não é ordem alfabética — é a taxonomia
  // do escritório, do processual ao financeiro), mas dentro de cada grupo os tipos vêm em ordem
  // alfanumérica pra ficar fácil de escanear visualmente. A busca filtra por nome sem diferenciar
  // maiúsc/minúsc/acento e esconde grupos que ficarem vazios.
  const grupos = useMemo(() => {
    const termo = normalize(search.trim());
    const base: { grupo: string; tipos: DocumentType[] }[] = DOCUMENT_TYPE_GROUPS.map((g) => ({
      grupo: g.group,
      tipos: g.types.filter((t) => !excludeKeys?.includes(t.key)),
    }));
    if (includeLegacy) {
      base.push({
        grupo: "Categorias antigas",
        tipos: LEGACY_DOCUMENT_TYPES.filter((t) => !excludeKeys?.includes(t.key)),
      });
    }
    return base
      .map((g) => ({
        grupo: g.grupo,
        tipos: g.tipos
          .filter((t) => !termo || normalize(t.label).includes(termo))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      }))
      .filter((g) => g.tipos.length > 0);
  }, [search, excludeKeys, includeLegacy]);

  const showTodos = allowAll && (!search.trim() || normalize("todos os tipos").includes(normalize(search.trim())));

  function handleSelect(key: string) {
    onChange(key);
    setOpen(false);
    setSearch("");
  }

  function handleClose() {
    setOpen(false);
    setSearch("");
  }

  useEscapeToClose(open, handleClose);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${className || ""} flex items-center justify-between gap-1.5 text-left bg-white`}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={13} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={handleClose}>
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] flex flex-col motion-safe:animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Selecionar tipo de documento</h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 pt-4 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/40 dark:text-cream-50/40 pointer-events-none" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tipo de documento..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-navy-800/10 dark:border-white/15 bg-white dark:bg-navy-800 text-sm text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
              {showTodos && (
                <button
                  type="button"
                  onClick={() => handleSelect("TODOS")}
                  className="flex items-center justify-between gap-2 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-navy-900 dark:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/5 transition-colors"
                >
                  Todos os tipos
                  {value === "TODOS" && <Check size={14} className="text-gold-600 dark:text-gold-400 shrink-0" />}
                </button>
              )}

              {grupos.length === 0 && !showTodos && (
                <p className="px-3 py-4 text-sm text-navy-800/50 dark:text-cream-50/50">Nenhum tipo de documento encontrado.</p>
              )}

              {grupos.map((g) => (
                <div key={g.grupo} className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">{g.grupo}</p>
                  {g.tipos.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => handleSelect(t.key)}
                        className="flex items-center justify-between gap-2 w-full rounded-lg px-3 py-2 text-left hover:bg-cream-100 dark:hover:bg-white/5 transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon size={14} className="shrink-0 text-navy-800/40 dark:text-cream-50/40" />
                          <span className="text-sm text-navy-900 dark:text-cream-50 truncate">{t.label}</span>
                        </span>
                        {value === t.key && <Check size={14} className="text-gold-600 dark:text-gold-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
