"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import RichTextEditor from "./RichTextEditor";
import { useAnotacoes, type AnotacaoDraft } from "./AnotacoesContext";
import { createAnotacao } from "@/lib/actions/anotacoes";
import { ANOTACAO_LINK_LABELS, anotacaoLinkNeedsEntity, todayIsoDate, type AnotacaoLinkType } from "@/lib/anotacoes";

const LINK_CHIPS: { value: AnotacaoLinkType; activeClass: string }[] = [
  { value: "PROCESSO_JUDICIAL", activeClass: "bg-gold-500 border-gold-500 text-white" },
  { value: "PROCESSO_ADMINISTRATIVO", activeClass: "bg-bordo-600 border-bordo-600 text-white" },
  { value: "CASO", activeClass: "bg-navy-800 border-navy-800 text-white dark:bg-white/25 dark:border-white/40 dark:text-cream-50" },
  { value: "ASSESSORIA", activeClass: "bg-blue-600 border-blue-600 text-white" },
  { value: "ATENDIMENTO", activeClass: "bg-emerald-600 border-emerald-600 text-white" },
  { value: "FINANCEIRO", activeClass: "bg-amber-600 border-amber-600 text-white" },
  { value: "OUTROS", activeClass: "bg-slate-600 border-slate-600 text-white" },
];

type EntityOption = { id: string; name: string };

export default function AnotacaoDraftForm({ draft, splitView }: { draft: AnotacaoDraft; splitView: boolean }) {
  const { updateDraft, cancelDraft, clearDraftAfterSave } = useAnotacoes();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>(
    draft.entityId && draft.entityLabel ? [{ id: draft.entityId, name: draft.entityLabel }] : []
  );
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Busca a lista de entidades (já filtrada por officeId no servidor) só quando o chip que
  // precisa de sub-seletor é escolhido — nunca pré-carregada, já que este painel existe em toda
  // página do site (ver app/api/anotacoes/entidades/route.ts).
  useEffect(() => {
    if (!draft.linkType || !anotacaoLinkNeedsEntity(draft.linkType)) return;
    let cancelled = false;
    setLoadingOptions(true);
    fetch(`/api/anotacoes/entidades?tipo=${draft.linkType}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setEntityOptions(Array.isArray(data.options) ? data.options : []);
      })
      .catch(() => {
        if (!cancelled) setEntityOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.linkType]);

  function pickLinkType(t: AnotacaoLinkType) {
    if (t === draft.linkType) return;
    updateDraft(draft.id, { linkType: t, entityId: null, entityLabel: null });
    setEntityOptions([]);
    setError(null);
  }

  function handleCancel() {
    cancelDraft(draft.id);
    setError(null);
  }

  function handleSave() {
    setError(null);
    if (!draft.linkType) {
      setError("Escolha a quem esta anotação se vincula.");
      return;
    }
    if (anotacaoLinkNeedsEntity(draft.linkType) && !draft.entityId) {
      setError("Selecione o item específico.");
      return;
    }
    if (!draft.referenceDate) {
      setError("Informe a data para consignar.");
      return;
    }

    startTransition(async () => {
      const result = await createAnotacao({
        linkType: draft.linkType!,
        entityId: draft.entityId ?? undefined,
        content: draft.content,
        referenceDate: draft.referenceDate,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      clearDraftAfterSave(draft.id);
      router.refresh();
    });
  }

  return (
    <div className={splitView ? "flex-1 min-h-0 flex flex-col gap-2.5 p-3 overflow-y-auto scrollbar-thin" : "flex flex-col gap-2.5 p-3"}>
      <div>
        <p className="text-[10.5px] font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1.5">Vincular a</p>
        <div className="flex flex-wrap gap-1.5">
          {LINK_CHIPS.map((chip) => {
            const active = draft.linkType === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => pickLinkType(chip.value)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? chip.activeClass
                    : "bg-white dark:bg-navy-800 border-navy-800/15 dark:border-white/15 text-navy-800/60 dark:text-cream-50/60 hover:border-navy-800/30 dark:hover:border-white/30"
                }`}
              >
                {ANOTACAO_LINK_LABELS[chip.value]}
              </button>
            );
          })}
        </div>
      </div>

      {draft.linkType && anotacaoLinkNeedsEntity(draft.linkType) && (
        <div>
          <p className="text-[10.5px] font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1.5">
            {ANOTACAO_LINK_LABELS[draft.linkType]}
          </p>
          <EntityPicker
            name="anotacaoEntityId"
            options={entityOptions}
            defaultValue={draft.entityId ?? undefined}
            placeholder={loadingOptions ? "Carregando..." : "Buscar..."}
            emptyLabel="Selecione"
            onChange={(id) => updateDraft(draft.id, { entityId: id, entityLabel: entityOptions.find((o) => o.id === id)?.name ?? null })}
          />
        </div>
      )}

      <div>
        <p className="text-[10.5px] font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1.5">Anotação</p>
        <RichTextEditor value={draft.content} onChange={(html) => updateDraft(draft.id, { content: html })} placeholder="Escreva sua anotação..." />
      </div>

      <div>
        <p className="text-[10.5px] font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1.5">Consignar em</p>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={draft.referenceDate}
            onChange={(e) => updateDraft(draft.id, { referenceDate: e.target.value })}
            className="flex-1 min-w-0 rounded-lg border border-navy-800/15 dark:border-white/15 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50 text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
          <button
            type="button"
            onClick={() => updateDraft(draft.id, { referenceDate: todayIsoDate() })}
            className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-cream-100 dark:bg-white/10 text-navy-800/70 dark:text-cream-50/70 hover:bg-cream-200 dark:hover:bg-white/15 transition-colors"
          >
            Hoje
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] text-bordo-600 dark:text-bordo-400">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-0.5 mt-auto">
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-3 py-1.5 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gold-600 hover:bg-gold-700 rounded-lg px-3.5 py-1.5 disabled:opacity-50 transition-colors"
        >
          <Check size={13} /> {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
