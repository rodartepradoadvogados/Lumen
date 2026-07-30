"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchCasesForLinking, linkPublicationToCase, blockProcessNumber } from "@/lib/actions/publications";
import { FilePlus2, ChevronDown, Search, X, Ban } from "lucide-react";

type CaseHit = { id: string; title: string; processNumber: string | null };

// Chooser que aparece no lugar do antigo botão "Cadastrar Processo" quando uma publicação/
// andamento não tem processo vinculado: permite cadastrar um processo novo, vincular a um
// processo já existente (busca por título ou número), ou — só quando há um número de processo
// identificado — bloquear o processo, parando de vez o recebimento de publicações/andamentos
// dele (ver blockProcessNumber, lib/actions/publications.ts; lista/reversão em Configurações).
export default function LinkPublicationMenu({
  publicationId,
  newCaseHref,
  processNumberRaw,
}: {
  publicationId: string;
  newCaseHref: string;
  processNumberRaw?: string | null;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaseHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchReqId = useRef(0);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const reqId = ++searchReqId.current;
    const timer = setTimeout(async () => {
      const res = await searchCasesForLinking(q);
      if (reqId !== searchReqId.current) return;
      setResults(res);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchOpen]);

  async function pickCase(caseId: string) {
    setLinking(true);
    await linkPublicationToCase(publicationId, caseId);
    setLinking(false);
    setSearchOpen(false);
    setQuery("");
    setResults([]);
    router.refresh();
  }

  async function confirmBlock() {
    setBlocking(true);
    await blockProcessNumber(publicationId);
    setBlocking(false);
    setBlockConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 dark:text-cream-50/60 dark:hover:text-cream-50 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200 dark:bg-white/10 dark:hover:bg-white/15"
        >
          <FilePlus2 size={12} /> Cadastrar Processo <ChevronDown size={11} />
        </button>
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-navy-900 rounded-lg border border-navy-800/10 dark:border-white/10 shadow-pop z-20 overflow-hidden"
          >
            <Link
              href={newCaseHref}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-900 dark:text-cream-50 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors"
            >
              <FilePlus2 size={13} /> Cadastrar novo processo
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setSearchOpen(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-900 dark:text-cream-50 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors"
            >
              <Search size={13} /> Vincular a processo já existente
            </button>
            {processNumberRaw && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setBlockConfirmOpen(true);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-bordo-700 dark:text-bordo-400 hover:bg-bordo-100/60 dark:hover:bg-bordo-700/15 transition-colors border-t border-navy-800/8 dark:border-white/10"
              >
                <Ban size={13} /> Bloquear
              </button>
            )}
          </div>
        )}
      </div>

      {blockConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!blocking) setBlockConfirmOpen(false);
          }}
        >
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 flex items-center gap-2">
                <Ban size={16} className="text-bordo-700 dark:text-bordo-400" /> Bloquear processo
              </h3>
              {!blocking && (
                <button onClick={() => setBlockConfirmOpen(false)} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-navy-800 dark:text-cream-50/85">
                Esta ação faz com que esta conta não receba publicações e andamentos processuais deste processo. Tem certeza?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={blocking}
                  onClick={() => setBlockConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-800/70 dark:text-cream-50/70 hover:bg-cream-100 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  Não
                </button>
                <button
                  type="button"
                  disabled={blocking}
                  onClick={confirmBlock}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-bordo-700 hover:bg-bordo-800 text-white disabled:opacity-50"
                >
                  {blocking ? "Bloqueando..." : "Sim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setSearchOpen(false);
          }}
        >
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Vincular a processo existente</h3>
              <button onClick={() => setSearchOpen(false)} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título ou número do processo..."
                className="w-full border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-2 text-sm"
              />
              {searching && <p className="text-xs text-navy-800/50 dark:text-cream-50/50 px-1">Buscando...</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-navy-800/50 dark:text-cream-50/50 px-1">Nenhum processo encontrado.</p>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={linking}
                  onClick={() => pickCase(c.id)}
                  className="flex flex-col items-start w-full px-3 py-2 rounded-lg text-left hover:bg-cream-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  <span className="text-sm text-navy-900 dark:text-cream-50">{c.title}</span>
                  {c.processNumber && <span className="text-xs text-navy-800/45 dark:text-cream-50/45">{c.processNumber}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
