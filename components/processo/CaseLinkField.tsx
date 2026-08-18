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
    const result = await removeCaseLink(linkId);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <label className="text-xs font-medium text-tx-2">Processos vinculados</label>
      {error && <p className="text-[11px] text-urgente mt-1">{error}</p>}

      {links.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {links.map((l) => (
            <div key={l.linkId} className="flex items-center justify-between gap-2 bg-sf-apoio rounded-lg px-3 py-2">
              <div className="min-w-0">
                <Link href={`/processos/${l.other.id}`} className="text-xs font-semibold text-tx hover:underline truncate block">
                  {l.other.title}
                </Link>
                <p className="text-[11px] text-tx-2">
                  {l.other.processNumber && <>{l.other.processNumber} · </>}
                  {roleLabel[l.role]}
                </p>
              </div>
              <button type="button" onClick={() => handleRemove(l.linkId)} className="shrink-0 text-tx-3 hover:text-atencao">
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
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-marca-tx hover:underline"
          >
            <Search size={13} /> Vincular a outro processo
          </button>
        ) : (
          <div className="border border-regua rounded-lg p-2.5 space-y-2">
            {!picked ? (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por número ou título do processo..."
                  className="w-full border border-regua bg-sf text-tx rounded-lg px-3 py-1.5 text-xs"
                />
                {searching && <p className="text-[11px] text-tx-2">Buscando...</p>}
                {!searching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-[11px] text-tx-2">Nenhum processo encontrado.</p>
                )}
                {results.length > 0 && (
                  <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-1">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setPicked({ id: r.id, title: r.title })}
                        className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg hover:bg-sf-apoio"
                      >
                        <span className="font-medium text-tx">{r.title}</span>
                        {r.processNumber && <span className="text-tx-2"> — {r.processNumber}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setSearchOpen(false)} className="text-[11px] text-tx-2 hover:underline">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-tx">
                  Vincular a <strong>{picked.title}</strong>
                </p>
                <div>
                  <p className="text-[11px] text-tx-2 mb-1">Qual é o principal?</p>
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
                            ? "bg-acao text-acao-tx border-acao"
                            : "bg-sf text-tx-2 border-regua"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={confirmLink}
                    className="text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {saving ? "Vinculando..." : "Vincular"}
                  </button>
                  <button type="button" onClick={() => setPicked(null)} className="text-[11px] text-tx-2 hover:underline">
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
