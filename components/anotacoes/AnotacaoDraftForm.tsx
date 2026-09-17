"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import EntityPicker from "@/components/EntityPicker";
import RichTextEditor from "@/components/RichTextEditor";
import { useAnotacoes, type AnotacaoDraft } from "./AnotacoesContext";
import { createAnotacao } from "@/lib/actions/anotacoes";
import { ANOTACAO_LINK_LABELS, anotacaoLinkNeedsEntity, todayIsoDate, type AnotacaoLinkType } from "@/lib/anotacoes";

// "VINCULAR A" — sete opções, UM estado de seleção.
//
// Até 17/09/2026 cada opção carregava a sua própria `activeClass`, e o chip escolhido mudava de
// cor conforme QUAL opção fosse. É um grupo de escolha única: só um chip fica aceso por vez, e a
// pergunta que ele responde é sempre a mesma — "é este". Sete pinturas para um estado só.
//
// Três das sete pinturas quebravam regra da casa, e não por descuido de quem escreveu: o
// comentário anterior aqui defendia justamente que ouro e vinho ficassem fora. O problema é que
// as cores escolhidas no lugar deles vieram do VOCABULÁRIO DE RISCO, que tem significado fixo no
// produto inteiro:
//
//   bg-acao      · bordô, que é a ação e o vencido       → aqui significava "Processo Judicial"
//   bg-aviso     · âmbar, que é "vence hoje"             → aqui significava "Financeiro"
//   bg-concluido · verde, que é "em dia"                 → aqui significava "Atendimento"
//
// Quer dizer: escolher "Atendimento" pintava o chip da mesma cor que a tela usa para dizer "está
// em dia". A regra que o próprio sistema tem escrita (tailwind.config.ts) é "cor é risco ou é
// lugar, NUNCA categoria de conteúdo" — e este era o lugar onde ela estava sendo quebrada.
//
// Havia ainda uma quarta: `bg-faixa-ameixa`, roxo, removido do produto em 17/09/2026.
//
// E um defeito medido: `text-white` cravado sobre `bg-fonte-pje`. Esse token aponta para
// --faixa-ardosia, que é ESCURA no tema Manhã (#2f5d73, branco a 7,16:1) e CLARA no Noite
// (#4a93b5, branco a 3,42:1 — abaixo do mínimo AA de 4,5:1). É exatamente o defeito de
// `text-white` cravado sobre fundo que troca com o tema, que já apareceu quatro vezes neste
// repositório. O `--rotulo` existe para isso: ele inverte com a casca.
//
// Agora o chip selecionado é bronze (--guia-ativa), o mesmo "é este que está escolhido" da aba de
// ficha e da caixa do rail. Uma cor, um significado.
const LINK_CHIPS: AnotacaoLinkType[] = [
  "PROCESSO_JUDICIAL",
  "PROCESSO_ADMINISTRATIVO",
  "CASO",
  "ASSESSORIA",
  "ATENDIMENTO",
  "FINANCEIRO",
  "OUTROS",
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
        <p className="text-etiqueta font-semibold text-tx-2 uppercase tracking-wide mb-1.5">Vincular a</p>
        <div className="flex flex-wrap gap-1.5">
          {LINK_CHIPS.map((chip) => {
            const active = draft.linkType === chip;
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={active}
                onClick={() => pickLinkType(chip)}
                className={`text-etiqueta font-semibold px-2.5 py-1 rounded-[2px] border transition-colors duration-100 ease-out ${
                  active
                    ? "bg-guia-ativa border-guia-ativa text-rotulo"
                    : "bg-sf border-regua-forte text-tx-2 hover:bg-sf-apoio hover:text-tx"
                }`}
              >
                {ANOTACAO_LINK_LABELS[chip]}
              </button>
            );
          })}
        </div>
      </div>

      {draft.linkType && anotacaoLinkNeedsEntity(draft.linkType) && (
        <div>
          <p className="text-etiqueta font-semibold text-tx-2 uppercase tracking-wide mb-1.5">
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
        <p className="text-etiqueta font-semibold text-tx-2 uppercase tracking-wide mb-1.5">Anotação</p>
        <RichTextEditor value={draft.content} onChange={(html) => updateDraft(draft.id, { content: html })} placeholder="Escreva sua anotação..." />
      </div>

      <div>
        <p className="text-etiqueta font-semibold text-tx-2 uppercase tracking-wide mb-1.5">Consignar em</p>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={draft.referenceDate}
            onChange={(e) => updateDraft(draft.id, { referenceDate: e.target.value })}
            className="flex-1 min-w-0 border border-regua bg-sf text-tx text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-marca-tx"
          />
          <button
            type="button"
            onClick={() => updateDraft(draft.id, { referenceDate: todayIsoDate() })}
            className="shrink-0 text-etiqueta font-semibold px-2.5 py-1.5 bg-sf-apoio text-tx-2 hover:bg-regua transition-colors"
          >
            Hoje
          </button>
        </div>
      </div>

      {error && <p className="text-etiqueta text-urgente">{error}</p>}

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
          className="flex items-center gap-1.5 text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover px-3.5 py-1.5 disabled:opacity-50 transition-colors"
        >
          <Check size={13} /> {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
