"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/actions/search";

const GROUP_ORDER: SearchResult["type"][] = ["Processos", "Clientes", "Tarefas", "Atendimentos", "Publicações"];

// Abaixo de ~4cm de largura disponível (151px, aproximando 1cm por 37.8px a 96dpi — CSS px não é
// uma unidade física de verdade, mas é a referência prática mais próxima que dá pra medir em
// tempo real) não sobra espaço nem pra digitar nem pra ler nada na própria barra do TopBar (que
// divide espaço com Peticionar/+Novo/avatar e encolhe bastante em telas divididas). Só nesse caso
// a busca vira um botão-gatilho que abre um painel largo e fixo abaixo do cabeçalho; do contrário,
// digita-se direto na própria barra, como sempre foi.
const MIN_INLINE_WIDTH_PX = 151;

function SearchResultsList({
  loading,
  results,
  ordered,
  activeIndex,
  onHover,
  onSelect,
}: {
  loading: boolean;
  results: SearchResult[];
  ordered: SearchResult[];
  activeIndex: number;
  onHover: (idx: number) => void;
  onSelect: () => void;
}) {
  return (
    <>
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
                  // Link de verdade (não button+router.push): navegação por clique/toque precisa
                  // ser à prova de qualquer corrida entre o listener de "clicar fora" (mousedown,
                  // ver useEffect de onClickOutside) e o clique em si — mesmo padrão já usado em
                  // components/NewEntityMenu.tsx pra esse tipo de item de menu que navega e fecha.
                  <Link
                    key={`${item.type}-${item.id}`}
                    href={item.href}
                    onMouseEnter={() => onHover(idx)}
                    onClick={onSelect}
                    className={`flex flex-col items-start w-full px-4 py-2.5 text-left transition-colors ${
                      active ? "bg-cream-100 dark:bg-white/10" : "hover:bg-cream-50 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate w-full">{item.titulo}</span>
                    {item.subtitulo && <span className="text-xs text-navy-800/50 dark:text-cream-50/50 truncate w-full">{item.subtitulo}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
    </>
  );
}

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Só passa a existir se a barra estiver estreita demais (ver MIN_INLINE_WIDTH_PX) — nesse caso
  // vira um botão-gatilho, e este estado controla se o painel largo abaixo do cabeçalho está
  // aberto. Na barra larga (caso comum), digita-se direto nela e este estado nunca é usado.
  const [narrow, setNarrow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const expandedInputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Mede a largura disponível da própria barra (não da janela inteira) pra decidir entre digitar
  // ali mesmo ou abrir o painel abaixo — useLayoutEffect (não useEffect) pra medir antes da
  // primeira pintura e evitar um flash no modo errado (mesmo padrão de components/PublicationRow.tsx).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setNarrow(el.offsetWidth < MIN_INLINE_WIDTH_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  // Fecha o painel expandido (modo estreito) ao clicar fora dele — o botão-gatilho fica fora do
  // panelRef de propósito, pra clicar nele de novo não reabrir sem fechar antes.
  useEffect(() => {
    if (!narrow || !expanded) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setExpanded(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [narrow, expanded]);

  // Fecha o dropdown do modo largo (barra normal) ao clicar fora da barra inteira.
  useEffect(() => {
    if (narrow) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setResults([]);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [narrow]);

  // Autofoco no campo grande assim que o painel do modo estreito abre — quem clicou no
  // botão-gatilho espera poder digitar na hora, sem precisar de um segundo clique.
  useEffect(() => {
    if (narrow && expanded) expandedInputRef.current?.focus();
  }, [narrow, expanded]);

  // Atalho global ⌘K / Ctrl+K — foca a barra direto (modo largo) ou abre o painel e foca (modo
  // estreito). Ignora quando o foco já está num campo de texto/textarea/contenteditable, pra não
  // roubar o "k" de quem está digitando em outro formulário na tela.
  useEffect(() => {
    function onKeyDownGlobal(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      if (narrow) {
        setExpanded(true);
      } else {
        inlineInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
  }, [narrow]);

  // Ordena resultados agrupados para navegação por teclado
  const ordered: SearchResult[] = GROUP_ORDER.flatMap((g) => results.filter((r) => r.type === g));

  function reset() {
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
  }

  // Só usado pela tecla Enter (seleção por teclado não tem <Link> pra clicar) — o clique do mouse
  // navega pelo próprio <Link> em SearchResultsList.
  function selectByKeyboard(result: SearchResult) {
    reset();
    setExpanded(false);
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
      if (chosen) selectByKeyboard(chosen);
    }
  }

  const showDropdown = query.trim().length >= 2;

  return (
    <div ref={containerRef} className="flex-1 max-w-md relative">
      {narrow ? (
        <>
          {/* Botão-gatilho: só existe quando a barra ficou estreita demais pra digitar nela
              (ver MIN_INLINE_WIDTH_PX) — nunca é onde se digita, só abre o painel largo abaixo. */}
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
                    ref={expandedInputRef}
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
                    <SearchResultsList
                      loading={loading}
                      results={results}
                      ordered={ordered}
                      activeIndex={activeIndex}
                      onHover={setActiveIndex}
                      onSelect={() => {
                        reset();
                        setExpanded(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Barra normal: digita-se direto aqui, como sempre foi — só entra em modo estreito
              (acima) quando não sobra nem ~4cm de largura pra isso. */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/40 dark:text-cream-50/40 pointer-events-none" />
            <input
              ref={inlineInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pesquisar tudo"
              className="w-full pl-9 pr-12 py-2 rounded-lg border border-navy-800/10 dark:border-white/10 bg-white dark:bg-navy-900 text-sm text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
            />
            {!query && (
              <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 rounded border border-navy-800/15 dark:border-white/15 text-[11px] font-medium text-navy-800/40 dark:text-cream-50/40 pointer-events-none">
                ⌘K
              </kbd>
            )}
          </div>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-navy-900 rounded-xl border border-navy-800/10 dark:border-white/10 shadow-pop overflow-hidden max-h-[65vh] overflow-y-auto scrollbar-thin">
              <SearchResultsList
                loading={loading}
                results={results}
                ordered={ordered}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                onSelect={reset}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
