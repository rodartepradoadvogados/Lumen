"use client";

import { useState } from "react";
import Link from "next/link";
import {
  applyClientOpponentNamingConvention,
  previewClientOpponentNamingConvention,
  type CaseNamingResult,
  type CaseNamingSuggestion,
} from "@/lib/actions/cases";
import { SquarePen, EyeOff } from "lucide-react";
import ModalShell from "@/components/ModalShell";

export default function RenameCasesToConventionButton() {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaseNamingResult | null>(null);

  const [suggestions, setSuggestions] = useState<CaseNamingSuggestion[] | null>(null);
  const [withoutClient, setWithoutClient] = useState<{ id: string; title: string; processNumber: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());

  async function openPreview() {
    setLoadingPreview(true);
    setError(null);
    setResult(null);
    const preview = await previewClientOpponentNamingConvention();
    setLoadingPreview(false);
    if ("error" in preview) {
      setError(preview.error);
      return;
    }
    if (preview.suggestions.length === 0 && preview.withoutClient.length === 0) {
      setResult({ renamed: 0, driveRenameErrors: 0, withoutClient: [] });
      return;
    }
    setSuggestions(preview.suggestions);
    setWithoutClient(preview.withoutClient);
    // Tudo começa selecionado — "Aplicar nos selecionados" com nada desmarcado equivale a
    // "Aplicar em tudo"; o usuário desmarca só o que quer deixar de fora desta rodada.
    setSelected(new Set(preview.suggestions.map((s) => s.id)));
    setDiscarded(new Set());
  }

  function closeModal() {
    setSuggestions(null);
    setWithoutClient([]);
    setSelected(new Set());
    setDiscarded(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDiscarded(id: string) {
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply(applyIds: string[]) {
    setApplying(true);
    setError(null);
    const res = await applyClientOpponentNamingConvention(applyIds, Array.from(discarded));
    setApplying(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setResult(res);
    closeModal();
  }

  const suggestionCount = suggestions?.length ?? 0;

  return (
    <div className="space-y-2">
      <button
        onClick={openPreview}
        disabled={loadingPreview}
        className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit disabled:opacity-50"
      >
        <SquarePen size={16} /> {loadingPreview ? "Conferindo..." : 'Aplicar padrão "Cliente x Parte Adversa" aos processos existentes'}
      </button>

      {error && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}

      {result && (
        <div className="text-xs text-tx-2 bg-sf-apoio border border-regua px-3 py-2 space-y-2">
          {result.renamed === 0 && result.withoutClient.length === 0 ? (
            <p>Nenhum processo precisa de padronização — todos já seguem &ldquo;Cliente x Parte Adversa&rdquo; ou não têm parte adversa cadastrada.</p>
          ) : (
            <p>
              {result.renamed} processo(s) renomeado(s)
              {result.driveRenameErrors > 0 && ` · ${result.driveRenameErrors} pasta(s) no Drive não puderam ser renomeadas (o sync diário vai sinalizar isso na Central de Alertas)`}
            </p>
          )}
          {result.withoutClient.length > 0 && (
            <div>
              <p className="font-semibold text-tx">
                {result.withoutClient.length} processo(s) sem cliente cadastrado — não deu pra aplicar o padrão:
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {result.withoutClient.map((c) => (
                  <li key={c.id}>
                    <Link href={`/processos/${c.id}`} className="text-acao hover:underline">
                      {c.title}
                    </Link>
                    {c.processNumber && <span className="text-tx-2"> · {c.processNumber}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {suggestions && (
        <ModalShell
          size="cheio"
          title='Padronizar título "Cliente x Parte Adversa"'
          subtitle={`${suggestionCount} processo(s) ficariam com o título diferente do que têm hoje — revise antes de aplicar`}
          onClose={closeModal}
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            {suggestionCount === 0 ? (
              <p className="text-sm text-tx-2 p-5">Nenhum processo precisa de padronização no momento.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-sf-apoio">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.size === suggestions.length}
                        onChange={() =>
                          setSelected(selected.size === suggestions.length ? new Set() : new Set(suggestions.map((s) => s.id)))
                        }
                        className="h-4 w-4 rounded border-regua-forte"
                        data-tip="Selecionar todos"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-tx-2 text-xs uppercase tracking-wide">Nome atual</th>
                    <th className="text-left px-3 py-2 font-semibold text-tx-2 text-xs uppercase tracking-wide">Como ficará</th>
                    <th className="text-right px-3 py-2 font-semibold text-tx-2 text-xs uppercase tracking-wide">Descartar sugestão futura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-regua">
                  {suggestions.map((s) => {
                    const isDiscarded = discarded.has(s.id);
                    return (
                      <tr key={s.id} className={isDiscarded ? "opacity-50" : undefined}>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(s.id)}
                            onChange={() => toggleSelected(s.id)}
                            disabled={isDiscarded}
                            className="h-4 w-4 rounded border-regua-forte"
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-tx-2">
                          {s.currentTitle}
                          {s.processNumber && <span className="block text-[11px] text-tx-3">{s.processNumber}</span>}
                        </td>
                        <td className="px-3 py-2 align-top text-tx font-medium">{s.newTitle}</td>
                        <td className="px-3 py-2 align-top text-right">
                          <button
                            type="button"
                            onClick={() => toggleDiscarded(s.id)}
                            data-tip="Não sugerir de novo nas próximas conferências"
                            className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 transition-colors ${
                              isDiscarded ? "bg-atencao/10 text-atencao font-semibold" : "text-tx-3 hover:text-atencao hover:bg-atencao/10"
                            }`}
                          >
                            <EyeOff size={13} /> {isDiscarded ? "Descartada" : "Descartar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {withoutClient.length > 0 && (
              <div className="px-5 py-4 border-t border-regua text-xs">
                <p className="font-semibold text-tx mb-1.5">
                  {withoutClient.length} processo(s) sem cliente cadastrado — não dá pra aplicar o padrão:
                </p>
                <ul className="space-y-0.5">
                  {withoutClient.map((c) => (
                    <li key={c.id}>
                      <Link href={`/processos/${c.id}`} className="text-acao hover:underline">
                        {c.title}
                      </Link>
                      {c.processNumber && <span className="text-tx-2"> · {c.processNumber}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {suggestionCount > 0 && (
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-regua">
              <p className="text-xs text-tx-2">
                {selected.size} de {suggestionCount} selecionado(s)
                {discarded.size > 0 && ` · ${discarded.size} marcado(s) para descartar`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={applying}
                  className="text-sm text-tx-2 hover:text-tx px-3 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => apply(Array.from(selected))}
                  disabled={applying || selected.size === 0}
                  className="bg-sf border border-regua-forte text-tx text-sm font-semibold px-4 py-2 hover:bg-sf-apoio disabled:opacity-50"
                >
                  {applying ? "Aplicando..." : "Aplicar nos selecionados"}
                </button>
                <button
                  type="button"
                  onClick={() => apply(suggestions.map((s) => s.id))}
                  disabled={applying}
                  className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
                >
                  {applying ? "Aplicando..." : "Aplicar em tudo"}
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
