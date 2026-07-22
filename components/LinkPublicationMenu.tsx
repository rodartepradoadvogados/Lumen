"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchCasesForLinking, linkPublicationToCase } from "@/lib/actions/publications";
import { FilePlus2, ChevronDown, Search, X } from "lucide-react";

type CaseHit = { id: string; title: string; processNumber: string | null };

// Chooser que aparece no lugar do antigo botão "Cadastrar Processo" quando uma publicação/
// andamento não tem processo vinculado: permite tanto cadastrar um processo novo quanto
// vincular a um processo já existente (busca por título ou número).
export default function LinkPublicationMenu({ publicationId, newCaseHref }: { publicationId: string; newCaseHref: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
          </div>
        )}
      </div>

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
