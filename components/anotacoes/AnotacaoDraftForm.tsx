"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import RichTextEditor from "./RichTextEditor";
import { useAnotacoes, type AnotacaoDraft } from "./AnotacoesContext";
import { createAnotacao } from "@/lib/actions/anotacoes";
import { ANOTACAO_LINK_LABELS, anotacaoLinkNeedsEntity, todayIsoDate, type AnotacaoLinkType } from "@/lib/anotacoes";

// Ouro e vinho ficam reservados à marca/ação destrutiva (DESIGN-SYSTEM.md §16) e não podem
// virar fundo destes chips de categoria — PROCESSO_JUDICIAL e PROCESSO_ADMINISTRATIVO usam
// azul-tinta de ação e um tom neutro próprio para continuar distintos dos demais.
const LINK_CHIPS: { value: AnotacaoLinkType; activeClass: string }[] = [
  { value: "PROCESSO_JUDICIAL", activeClass: "bg-acao border-acao text-acao-tx" },
  { value: "PROCESSO_ADMINISTRATIVO", activeClass: "bg-purple-600 border-purple-600 text-white" },
  { value: "CASO", activeClass: "bg-tx border-tx text-sf" },
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
        <p className="text-[10.5px] font-semibold text-tx-2 uppercase tracking-wide mb-1.5">Vincular a</p>
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
                    : "bg-sf border-regua text-tx-2 hover:border-regua"
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
          <p className="text-[10.5px] font-semibold text-tx-2 uppercase tracking-wide mb-1.5">
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
        <p className="text-[10.5px] font-semibold text-tx-2 uppercase tracking-wide mb-1.5">Anotação</p>
        <RichTextEditor value={draft.content} onChange={(html) => updateDraft(draft.id, { content: html })} placeholder="Escreva sua anotação..." />
      </div>

      <div>
        <p className="text-[10.5px] font-semibold text-tx-2 uppercase tracking-wide mb-1.5">Consignar em</p>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={draft.referenceDate}
            onChange={(e) => updateDraft(draft.id, { referenceDate: e.target.value })}
            className="flex-1 min-w-0 rounded-lg border border-regua bg-sf text-tx text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-acao/40"
          />
          <button
            type="button"
            onClick={() => updateDraft(draft.id, { referenceDate: todayIsoDate() })}
            className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-sf-apoio text-tx-2 hover:bg-regua transition-colors"
          >
            Hoje
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] text-urgente">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-0.5 mt-auto">
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex items-center gap-1.5 text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover rounded-lg px-3.5 py-1.5 disabled:opacity-50 transition-colors"
        >
          <Check size={13} /> {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
