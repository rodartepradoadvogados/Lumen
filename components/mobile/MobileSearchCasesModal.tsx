"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setCaseAssessoria } from "@/lib/actions/assessoria";
import { Search, Link2, X } from "lucide-react";

type CaseOption = { id: string; title: string; processNumber: string | null };

// Mesma busca/vínculo de processos existentes já disponível na aba "Pareceres, Processos e
// Casos" da Assessoria no site (components/assessoria/AssessoriaProcessosCasosTab.tsx),
// adaptada pro app mobile — janela suspensa própria, "Abrir" navega dentro do próprio app
// (/m/processos/{id}, nunca pro site desktop).
export default function MobileSearchCasesModal({
  assessoriaId,
  availableCases,
}: {
  assessoriaId: string;
  availableCases: CaseOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [linkedThisSession, setLinkedThisSession] = useState<string[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredCases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableCases
      .filter((c) => !linkedThisSession.includes(c.id))
      .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.processNumber || "").toLowerCase().includes(q));
  }, [availableCases, query, linkedThisSession]);

  function handleLink(caseId: string) {
    setError(null);
    setLinkingId(caseId);
    startTransition(async () => {
      const result = await setCaseAssessoria(caseId, assessoriaId);
      setLinkingId(null);
      if (result.error) setError(result.error);
      else {
        setLinkedThisSession((ids) => [...ids, caseId]);
        router.refresh();
      }
    });
  }

  function close() {
    setOpen(false);
    setQuery("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg shrink-0"
      >
        <Search size={12} /> Pesquisar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-end sm:items-center justify-center" onClick={close}>
          <div
            className="bg-white dark:bg-navy-900 rounded-t-2xl sm:rounded-xl shadow-pop w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Pesquisar processos</h3>
              <button onClick={close} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por título ou número"
                  className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg pl-8 pr-3 py-2"
                />
              </div>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>

            <div className="overflow-y-auto scrollbar-thin flex-1 divide-y divide-navy-800/5 dark:divide-white/10">
              {filteredCases.length === 0 ? (
                <p className="text-sm text-navy-800/40 dark:text-cream-50/40 text-center py-8 px-5">
                  {availableCases.length === 0 ? "Não há processos disponíveis para vincular." : "Nenhum processo encontrado."}
                </p>
              ) : (
                filteredCases.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{c.title}</p>
                      {c.processNumber && <p className="text-xs text-navy-800/45 dark:text-cream-50/45">{c.processNumber}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/m/processos/${c.id}`}
                        className="text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 px-2 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5"
                      >
                        Abrir
                      </Link>
                      <button
                        onClick={() => handleLink(c.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        <Link2 size={12} /> {pending && linkingId === c.id ? "..." : "Vincular"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
