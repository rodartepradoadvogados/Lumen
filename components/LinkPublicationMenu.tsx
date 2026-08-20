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
          className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 bg-sf-apoio hover:bg-regua"
        >
          <FilePlus2 size={12} /> Cadastrar Processo <ChevronDown size={11} />
        </button>
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full mt-1 w-56 bg-sf border border-regua shadow-menu z-20 overflow-hidden"
          >
            <Link
              href={newCaseHref}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-tx hover:bg-sf-apoio transition-colors"
            >
              <FilePlus2 size={13} /> Cadastrar novo processo
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setSearchOpen(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-tx hover:bg-sf-apoio transition-colors"
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
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-atencao hover:bg-urgente-bg transition-colors border-t border-regua"
              >
                <Ban size={13} /> Bloquear
              </button>
            )}
          </div>
        )}
      </div>

      {blockConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-modal w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx flex items-center gap-2">
                <Ban size={16} className="text-atencao" /> Bloquear processo
              </h3>
              {!blocking && (
                <button onClick={() => setBlockConfirmOpen(false)} className="text-tx-3 hover:text-tx">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-tx">
                Esta ação faz com que você deixe de receber publicações e andamentos processuais deste processo — os
                demais advogados do escritório continuam recebendo normalmente. Tem certeza?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={blocking}
                  onClick={() => setBlockConfirmOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-tx-2 hover:bg-sf-apoio disabled:opacity-50"
                >
                  Não
                </button>
                <button
                  type="button"
                  disabled={blocking}
                  onClick={confirmBlock}
                  className="px-4 py-2 text-sm font-semibold bg-atencao hover:opacity-90 text-white disabled:opacity-50"
                >
                  {blocking ? "Bloqueando..." : "Sim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf shadow-modal w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua shrink-0">
              <h3 className="font-bold text-tx">Vincular a processo existente</h3>
              <button onClick={() => setSearchOpen(false)} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título ou número do processo..."
                className="w-full border border-regua bg-sf text-tx px-3 py-2 text-sm"
              />
              {searching && <p className="text-xs text-tx-2 px-1">Buscando...</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-tx-2 px-1">Nenhum processo encontrado.</p>
              )}
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={linking}
                  onClick={() => pickCase(c.id)}
                  className="flex flex-col items-start w-full px-3 py-2 text-left hover:bg-sf-apoio transition-colors disabled:opacity-50"
                >
                  <span className="text-sm text-tx">{c.title}</span>
                  {c.processNumber && <span className="text-xs text-tx-2 tabular-nums">{c.processNumber}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
