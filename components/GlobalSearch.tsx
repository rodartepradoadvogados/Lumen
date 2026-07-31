"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/actions/search";

const GROUP_ORDER: SearchResult["type"][] = ["Processos", "Clientes", "Tarefas", "Atendimentos", "Publicações"];

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // "open" virou "expanded": a busca deixou de digitar dentro da barrinha estreita do TopBar —
  // aqui só é um botão-gatilho — e passou a abrir um painel largo e fixo, centralizado abaixo do
  // cabeçalho. Isso existe porque o TopBar divide espaço com o resto dos controles (Peticionar,
  // +Novo, avatar...), então a barra real (`flex-1 max-w-md`) fica bem estreita quando a janela é
  // estreita (ex.: navegador em tela dividida) — digitar e ver sugestões ali dentro ficava
  // espremido e ilegível. Com o painel `fixed`, a largura nunca depende do espaço sobrando no
  // header, então funciona igual em qualquer largura de janela.
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Debounce da busca (300ms)
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
      setResults(res);
      setLoading(false);
      setActiveIndex(-1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fechar ao clicar fora do painel expandido (o botão-gatilho fica fora do panelRef de
  // propósito — clicar nele de novo com o painel já aberto só reabriria sem fechar antes).
  useEffect(() => {
    if (!expanded) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setExpanded(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [expanded]);

  // Autofoco no campo grande assim que o painel abre — quem clicou no botão-gatilho espera
  // poder digitar na hora, sem precisar de um segundo clique.
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  // Ordena resultados agrupados para navegação por teclado
  const ordered: SearchResult[] = GROUP_ORDER.flatMap((g) => results.filter((r) => r.type === g));

  function go(result: SearchResult) {
    setExpanded(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setExpanded(false);
      return;
    }
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

  const showDropdown = expanded && query.trim().length >= 2;

  return (
    <div className="flex-1 max-w-md relative">
      {/* Botão-gatilho: sempre estreito (segue o espaço que sobra no TopBar), nunca é onde se
          digita — só abre o painel largo abaixo. Assim a barra nunca fica espremida/ilegível,
          mesmo com o header cheio de outros controles ou a janela dividida ao meio. */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Abrir busca"
        className="relative w-full flex items-center gap-2 pl-9 pr-3 py-2 rounded-lg border border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900 text-left focus:outline-none focus:ring-2 focus:ring-gold-500/40"
      >
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/40 dark:text-cream-50/40" />
        <span className="text-sm text-navy-800/40 dark:text-cream-50/30 truncate">
          {query || "Pesquisar processo, contato ou tarefa..."}
        </span>
      </button>

      {expanded && (
        <>
          {/* Fundo translúcido: clicar fora do painel fecha (ver useEffect de onClickOutside) */}
          <div className="fixed inset-0 z-40 bg-navy-950/10 dark:bg-navy-950/50" aria-hidden="true" />
          <div ref={panelRef} className="fixed left-1/2 top-20 z-50 w-[min(640px,92vw)] -translate-x-1/2">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-800/40 dark:text-cream-50/40 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pesquisar processo, contato ou tarefa..."
                className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900 text-base text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 shadow-pop focus:outline-none focus:ring-2 focus:ring-gold-500/40"
              />
            </div>

            {showDropdown && (
              <div className="mt-2 bg-white dark:bg-navy-900 rounded-xl border border-navy-800/10 dark:border-white/10 shadow-pop overflow-hidden max-h-[65vh] overflow-y-auto scrollbar-thin">
                {loading && <p className="px-4 py-3 text-sm text-navy-800/50 dark:text-cream-50/50">Buscando...</p>}
                {!loading && ordered.length === 0 && <p className="px-4 py-3 text-sm text-navy-800/50 dark:text-cream-50/50">Nada encontrado.</p>}
                {!loading &&
                  GROUP_ORDER.map((group) => {
                    const groupItems = results.filter((r) => r.type === group);
                    if (groupItems.length === 0) return null;
                    return (
                      <div key={group} className="border-b border-navy-800/5 dark:border-white/10 last:border-0">
                        <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">{group}</p>
                        {groupItems.map((item) => {
                          const idx = ordered.indexOf(item);
                          const active = idx === activeIndex;
                          return (
                            <button
                              key={`${item.type}-${item.id}`}
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => go(item)}
                              className={`flex flex-col items-start w-full px-4 py-2.5 text-left transition-colors ${
                                active ? "bg-cream-100 dark:bg-white/10" : "hover:bg-cream-50 dark:hover:bg-white/5"
                              }`}
                            >
                              <span className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate w-full">{item.titulo}</span>
                              {item.subtitulo && <span className="text-xs text-navy-800/50 dark:text-cream-50/50 truncate w-full">{item.subtitulo}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
