"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/actions/search";

const GROUP_ORDER: SearchResult["type"][] = ["Processos", "Tarefas", "Atendimentos", "Publicações"];

// Adaptação mobile de components/GlobalSearch.tsx (mesma action/debounce de 300ms), com
// estilo full-width para telas pequenas e dropdown de resultados abaixo do campo.
//
// Todos os tipos de resultado que aparecem aqui (Processos, Tarefas, Atendimentos,
// Publicações) já têm tela própria em /m, então remapeamos o href retornado pela action
// (que aponta pro site desktop) para a rota mobile correspondente. "Clientes" é o único tipo
// sem equivalente mobile ainda (não existe tela de detalhe de cliente em /m) — em vez de
// linkar pro site desktop, esse grupo é descartado inteiro dos resultados (ver useEffect
// abaixo), então nem aparece no dropdown.
function toMobileHref(result: SearchResult): string {
  if (result.type === "Processos") return `/m/processos/${result.id}`;
  if (result.type === "Tarefas") return "/m/agenda";
  if (result.type === "Atendimentos") return `/m/atendimento/${result.id}`;
  if (result.type === "Publicações") return "/m/publicacoes";
  return result.href;
}

export default function MobileGlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const currentReq = ++reqId.current;
    const timer = setTimeout(async () => {
      const res = await globalSearch(q);
      if (currentReq !== reqId.current) return; // resposta obsoleta
      // "Clientes" ainda não tem tela própria em /m — descartado para nunca virar link pro
      // site desktop (ver comentário de toMobileHref acima).
      setResults(res.filter((r) => r.type !== "Clientes"));
      setLoading(false);
      setActiveIndex(-1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const ordered: SearchResult[] = GROUP_ORDER.flatMap((g) => results.filter((r) => r.type === g));

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(toMobileHref(result));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = ordered[activeIndex] ?? ordered[0];
      if (chosen) go(chosen);
    }
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative w-full" ref={containerRef}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-2 pointer-events-none"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Buscar processo, contato ou tarefa..."
        className="w-full pl-9 pr-3 py-3 rounded-xl border border-regua bg-sf text-sm text-tx placeholder:text-tx-3 shadow-card focus:outline-none focus:ring-2 focus:ring-acao/40"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-sf rounded-lg border border-regua shadow-pop z-50 overflow-hidden max-h-[60vh] overflow-y-auto scrollbar-thin">
          {loading && <p className="px-4 py-3 text-sm text-tx-2">Buscando...</p>}
          {!loading && ordered.length === 0 && (
            <p className="px-4 py-3 text-sm text-tx-2">Nada encontrado.</p>
          )}
          {!loading &&
            GROUP_ORDER.map((group) => {
              const groupItems = results.filter((r) => r.type === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} className="border-b border-regua last:border-0">
                  <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold text-tx-2 uppercase tracking-wide">
                    {group}
                  </p>
                  {groupItems.map((item) => {
                    const idx = ordered.indexOf(item);
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => go(item)}
                        className={`flex flex-col items-start w-full px-4 py-2.5 text-left transition-colors ${
                          active ? "bg-sf-apoio" : "hover:bg-sf-apoio"
                        }`}
                      >
                        <span className="text-sm font-medium text-tx truncate w-full">
                          {item.titulo}
                        </span>
                        {item.subtitulo && (
                          <span className="text-xs text-tx-2 truncate w-full">
                            {item.subtitulo}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
