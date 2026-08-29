"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Search } from "lucide-react";
import { globalSearch, type SearchResult } from "@/lib/actions/search";
import { RAIL_SECTIONS, isSectionVisible, visibleSectionItems } from "@/lib/navSections";
import { looseIncludes } from "@/lib/textNormalize";
import { useTabs } from "@/components/TabsProvider";
import type { OfficeModules } from "@/lib/officeModules";

// Paleta de comando ⌘K (documento 02 do handoff do redesenho Modernist) — substitui a antiga
// barra de busca inline (que virava um botão-gatilho em janelas estreitas) por um único padrão
// sempre igual: botão-gatilho compacto na faixa de topo, ⌘K/Ctrl+K abre um painel centralizado
// flutuante de qualquer lugar autenticado. Quatro grupos, nesta ordem: Processos e Clientes (do
// banco, via lib/actions/search.ts — que retorna mais tipos que isso, compartilhada com
// components/mobile/MobileGlobalSearch.tsx; os demais são descartados abaixo), Ações e Navegação
// (estáticos, filtrados aqui no cliente contra a mesma query).
type PaletteItem = {
  type: "Processos" | "Clientes" | "Ações" | "Navegação";
  id: string;
  titulo: string;
  subtitulo?: string;
  href: string;
};
const GROUP_ORDER: PaletteItem["type"][] = ["Processos", "Clientes", "Ações", "Navegação"];

// "Peticionar em…"/"Lançar honorário para…" do documento 02 são ações CONTEXTUAIS a um processo
// já localizado na busca — fora do escopo deste PR (exigiriam cruzar o resultado buscado com uma
// ação específica dele). Aqui só as ações diretas, sem contexto nenhum. "Ir para Conexões" também
// fica de fora: a rota /conexoes é do documento 04 (Fase 02), ainda não existe — aponta pra
// Configurações, o equivalente atual, até lá.
const STATIC_ACTIONS: { label: string; href: string }[] = [
  { label: "Peticionar", href: "/peticionar" },
  { label: "Ir para Configurações", href: "/configuracoes" },
];

export default function GlobalSearch({
  hasFinanceAccess,
  modules,
}: {
  hasFinanceAccess: boolean;
  modules: OfficeModules;
}) {
  const router = useRouter();
  const { openTab, goToLiveView } = useTabs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dbResults, setDbResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // Atalho global ⌘K/Ctrl+K (documento 02) — ignora quando o foco já está num campo de
  // texto/textarea/contenteditable, pra não roubar o "k" de quem está digitando em outro
  // formulário na tela.
  useEffect(() => {
    function onKeyDownGlobal(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else {
      setQuery("");
      setDbResults([]);
      setActiveIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Debounce da busca no banco (300ms) — só Processos/Clientes; Ações/Navegação são filtrados
  // localmente logo abaixo, sem round-trip nenhum.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setDbResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const currentReq = ++reqId.current;
    const timer = setTimeout(async () => {
      const res = await globalSearch(q);
      if (currentReq !== reqId.current) return; // resposta obsoleta
      setDbResults(res);
      setLoading(false);
      setActiveIndex(-1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Mesmo mecanismo de duplo clique/duplo Enter do resto da casca (components/NavRail.tsx,
  // components/PageSectionTabs.tsx): 1ª ativação arma a navegação depois de um instante; uma 2ª
  // ativação no MESMO item antes disso cancela e abre em aba nova — documento 02: "Duplo Enter
  // num resultado abre em guia nova, coerente com o resto do produto".
  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = clickTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  function activate(item: PaletteItem) {
    const pending = clickTimers.current[item.href];
    if (pending) {
      clearTimeout(pending);
      delete clickTimers.current[item.href];
      openTab(item.href, item.titulo);
      setOpen(false);
      return;
    }
    clickTimers.current[item.href] = setTimeout(() => {
      delete clickTimers.current[item.href];
      setOpen(false);
      goToLiveView();
      router.push(item.href);
    }, 250);
  }

  const q = query.trim();

  const actionItems: PaletteItem[] = STATIC_ACTIONS.filter((a) => !q || looseIncludes(a.label, q)).map((a) => ({
    type: "Ações",
    id: a.href,
    titulo: a.label,
    href: a.href,
  }));

  const navItems: PaletteItem[] = (() => {
    const all: PaletteItem[] = [{ type: "Navegação", id: "/painel", titulo: "Painel", href: "/painel" }];
    for (const section of RAIL_SECTIONS) {
      if (!isSectionVisible(section, { hasFinanceAccess, modules })) continue;
      for (const item of visibleSectionItems(section, { hasFinanceAccess, modules })) {
        all.push({ type: "Navegação", id: item.href, titulo: item.label, href: item.href });
      }
    }
    return q ? all.filter((n) => looseIncludes(n.titulo, q)) : all;
  })();

  // globalSearch() é compartilhada com a busca mobile (components/mobile/MobileGlobalSearch.tsx)
  // e ainda retorna Tarefas/Atendimentos/Publicações — a paleta de comando só usa Processos e
  // Clientes (documento 02), então o resto é descartado aqui, não na action.
  const dbItems: PaletteItem[] = dbResults
    .filter((r): r is SearchResult & { type: "Processos" | "Clientes" } => r.type === "Processos" || r.type === "Clientes")
    .map((r) => ({
      type: r.type,
      id: r.id,
      titulo: r.titulo,
      subtitulo: r.subtitulo,
      href: r.href,
    }));

  const ordered: PaletteItem[] = GROUP_ORDER.flatMap((g) =>
    g === "Ações" ? actionItems : g === "Navegação" ? navItems : dbItems.filter((r) => r.type === g)
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
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
      if (chosen) activate(chosen);
    }
  }

  return (
    <>
      {/* Borda + raio própria (ajuste de tema, agosto/2026): a faixa de topo deixou de ter uma
          "ilha clara" (bg-sf) por baixo do gatilho — sem contorno próprio, o botão ficaria só
          texto solto direto na faixa, sem nenhuma pista de que é clicável. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir busca (⌘K)"
        className="flex items-center gap-2 h-8 px-3 rounded-md border border-regua hover:bg-sf-apoio text-sm text-tx-2 hover:text-tx transition-colors"
      >
        <Search size={15} />
        <span className="hidden lg:inline">Buscar...</span>
        <kbd className="hidden lg:inline text-[10px] font-semibold text-tx-3 border border-regua-forte px-1.5 py-0.5 rounded-sm">⌘K</kbd>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-grafite-900/40" aria-hidden="true" />
          {/* 440px (documento 02) — painel centralizado, mesma posição fixa qualquer que seja o
              tamanho/posição do botão-gatilho que abriu. */}
          <div ref={panelRef} className="fixed left-1/2 top-20 z-50 w-[440px] max-w-[92vw] -translate-x-1/2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pesquisar processo, cliente, ação..."
                className="w-full h-[34px] pl-9 pr-3 border-2 border-regua-forte bg-sf text-sm text-tx placeholder:text-tx-3 shadow-menu focus:outline-none focus:ring-2 focus:ring-marca/40"
              />
            </div>

            <div className="mt-2 bg-sf border-2 border-tx shadow-menu overflow-hidden max-h-[65vh] overflow-y-auto scrollbar-thin">
              {loading && <p className="px-4 py-3 text-sm text-tx-2">Buscando...</p>}
              {!loading && q.length >= 2 && ordered.length === 0 && <p className="px-4 py-3 text-sm text-tx-2">Nada encontrado.</p>}
              {!loading &&
                GROUP_ORDER.map((group) => {
                  const groupItems = ordered.filter((r) => r.type === group);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={group} className="border-b border-regua last:border-0">
                      <p className="px-4 pt-2.5 pb-1 text-[8px] font-semibold text-tx-3 uppercase tracking-[.12em]">{group}</p>
                      {groupItems.map((item) => {
                        const idx = ordered.indexOf(item);
                        const active = idx === activeIndex;
                        return (
                          // Link de verdade (não button+router.push): navegação por clique/toque
                          // precisa ser à prova de qualquer corrida entre o listener de "clicar
                          // fora" (mousedown) e o clique em si.
                          <Link
                            key={`${item.type}-${item.id}`}
                            href={item.href}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={(e) => {
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
                              e.preventDefault();
                              activate(item);
                            }}
                            className={clsx(
                              "flex flex-col items-start w-full px-4 py-2.5 text-left transition-colors",
                              active ? "bg-sf-apoio" : "hover:bg-sf-apoio"
                            )}
                          >
                            <span className="text-sm font-medium text-tx truncate w-full">{item.titulo}</span>
                            {item.subtitulo && <span className="text-xs text-tx-2 truncate w-full">{item.subtitulo}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
