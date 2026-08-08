"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAnotacao } from "@/lib/actions/anotacoes";
import { plainTextToHtml, todayIsoDate, type AnotacaoLinkType } from "@/lib/anotacoes";

// Formulário de criação de anotação para o app mobile — escopo reduzido de propósito em relação
// ao painel desktop (components/anotacoes/AnotacoesPanel.tsx): textarea simples em vez de editor
// rico, sem seletor de chip/entidade (o vínculo já é a entidade cuja página de detalhe mostra
// este formulário) e sem suporte a duas anotações simultâneas. Mesmo precedente já usado no
// mobile para telas complexas do desktop (ver Fase 8 do Processo mobile) — a montagem/edição
// completa fica para o computador; aqui só o essencial: escrever, escolher a data, salvar.
export default function MobileNovaAnotacaoForm({ linkType, entityId }: { linkType: AnotacaoLinkType; entityId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    if (!text.trim()) {
      setError("Escreva algo na anotação.");
      return;
    }
    startTransition(async () => {
      const result = await createAnotacao({ linkType, entityId, content: plainTextToHtml(text), referenceDate: date });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setText("");
      setDate(todayIsoDate());
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escreva sua anotação..."
        rows={4}
        className="w-full rounded-lg border border-navy-800/15 dark:border-white/15 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50 text-sm px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
      />
      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor="mobile-anotacao-data">
          Consignar em
        </label>
        <input
          id="mobile-anotacao-data"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-navy-800/15 dark:border-white/15 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50 text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
        />
        <button
          type="button"
          onClick={() => setDate(todayIsoDate())}
          className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-cream-100 dark:bg-white/10 text-navy-800/70 dark:text-cream-50/70"
        >
          Hoje
        </button>
      </div>
      {error && <p className="text-[11px] text-bordo-600 dark:text-bordo-400">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="w-full text-xs font-semibold text-white bg-bordo-600 hover:bg-bordo-700 rounded-lg px-3.5 py-2 disabled:opacity-50 transition-colors"
      >
        {pending ? "Salvando..." : "Salvar anotação"}
      </button>
    </div>
  );
}
