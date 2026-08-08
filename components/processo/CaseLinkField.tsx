"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Search } from "lucide-react";
import { searchCasesForLinking } from "@/lib/actions/publications";
import { addCaseLink, removeCaseLink } from "@/lib/actions/caseLinks";

type LinkEntry = {
  linkId: string;
  other: { id: string; title: string; processNumber: string | null };
  role: "PRINCIPAL" | "VINCULADO" | "NENHUM_PRINCIPAL";
};

const roleLabel: Record<LinkEntry["role"], string> = {
  PRINCIPAL: "Principal",
  VINCULADO: "Vinculado (o outro é o principal)",
  NENHUM_PRINCIPAL: "Sem principal definido",
};

// Vínculo entre processos, sem motivo registrado — busca (mesmo mecanismo de
// searchCasesForLinking já usado em "Vincular a processo existente" nas Publicações), escolha de
// quem é o principal, e a lista já vinculada com opção de remover. Fica fora do form principal do
// EditCaseModal (cada ação aqui já salva sozinha e atualiza a lista) — mesma lógica de não
// competir com o botão "Salvar" do InstanciaTribunalPanel.
export default function CaseLinkField({ caseId, links }: { caseId: string; links: LinkEntry[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState<{ id: string; title: string; processNumber: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const [principal, setPrincipal] = useState<"SELF" | "OTHER" | "NONE">("NONE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchReqId = useRef(0);

  useEffect(() => {
    if (!searchOpen || picked) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const reqId = ++searchReqId.current;
    const timer = setTimeout(async () => {
      const res = await searchCasesForLinking(query);
      if (reqId !== searchReqId.current) return;
      setResults(res.filter((r) => r.id !== caseId && !links.some((l) => l.other.id === r.id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchOpen, picked, caseId, links]);

  async function confirmLink() {
    if (!picked) return;
    setSaving(true);
    setError("");
    const result = await addCaseLink(caseId, picked.id, principal);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPicked(null);
    setQuery("");
    setSearchOpen(false);
    setPrincipal("NONE");
    router.refresh();
  }

  async function handleRemove(linkId: string) {
    if (!window.confirm("Remover este vínculo entre os processos?")) return;
    await removeCaseLink(linkId);
    router.refresh();
  }

  return (
    <div>
      <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Processos vinculados</label>

      {links.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {links.map((l) => (
            <div key={l.linkId} className="flex items-center justify-between gap-2 bg-cream-100 dark:bg-white/5 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <Link href={`/processos/${l.other.id}`} className="text-xs font-semibold text-navy-900 dark:text-cream-50 hover:underline truncate block">
                  {l.other.title}
                </Link>
                <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                  {l.other.processNumber && <>{l.other.processNumber} · </>}
                  {roleLabel[l.role]}
                </p>
              </div>
              <button type="button" onClick={() => handleRemove(l.linkId)} className="shrink-0 text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1.5">
        {!searchOpen ? (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline"
          >
            <Search size={13} /> Vincular a outro processo
          </button>
        ) : (
          <div className="border border-navy-800/12 dark:border-white/15 rounded-lg p-2.5 space-y-2">
            {!picked ? (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por número ou título do processo..."
                  className="w-full border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-3 py-1.5 text-xs"
                />
                {searching && <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">Buscando...</p>}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">Nenhum processo encontrado.</p>
                )}
                {results.length > 0 && (
                  <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-1">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setPicked({ id: r.id, title: r.title })}
                        className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5"
                      >
                        <span className="font-medium text-navy-900 dark:text-cream-50">{r.title}</span>
                        {r.processNumber && <span className="text-navy-800/45 dark:text-cream-50/45"> — {r.processNumber}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setSearchOpen(false)} className="text-[11px] text-navy-800/45 dark:text-cream-50/45 hover:underline">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-navy-800 dark:text-cream-50">
                  Vincular a <strong>{picked.title}</strong>
                </p>
                <div>
                  <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 mb-1">Qual é o principal?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["SELF", "Este processo"],
                        ["OTHER", "O outro processo"],
                        ["NONE", "Nenhum"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPrincipal(value)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                          principal === value
                            ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                            : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {error && <p className="text-[11px] text-bordo-700 dark:text-bordo-400">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={confirmLink}
                    className="text-xs font-semibold bg-bordo-700 hover:bg-bordo-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {saving ? "Vinculando..." : "Vincular"}
                  </button>
                  <button type="button" onClick={() => setPicked(null)} className="text-[11px] text-navy-800/45 dark:text-cream-50/45 hover:underline">
                    Voltar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
