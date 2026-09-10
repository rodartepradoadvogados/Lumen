"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createParecer, updateParecer } from "@/lib/actions/assessoria";

type ParecerBase = { id: string; name: string; date: Date | string; description: string | null };

function dateInputValue(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

// Formulário de criar/editar Demanda (Parecer) no app — página própria com barra "Salvar" fixa,
// mesmo padrão de MobileLicitacaoForm.tsx. Antes desta entrega não existia NENHUM jeito de criar
// uma demanda pelo celular (só enviar documento dentro de uma já existente).
export default function MobileParecerForm({ assessoriaId, parecer }: { assessoriaId: string; parecer?: ParecerBase }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const payload = {
      name: String(formData.get("name") || ""),
      date: String(formData.get("date") || ""),
      description: String(formData.get("description") || ""),
    };
    startTransition(async () => {
      const result = parecer ? await updateParecer(parecer.id, payload) : await createParecer(assessoriaId, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      const id = parecer ? parecer.id : (result as { id?: string }).id;
      router.push(id ? `/m/assessoria/${assessoriaId}/pareceres/${id}` : `/m/assessoria/${assessoriaId}`);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col" style={{ minHeight: "calc(100dvh - 3.5rem)" }}>
      <div className="flex-1 p-4 space-y-3 pb-24">
        <div>
          <label className="text-[13px] font-semibold text-tx-2" htmlFor="parecer-name">Nome da demanda</label>
          <input id="parecer-name" name="name" required defaultValue={parecer?.name || ""} className="mobile-parecer-input" />
        </div>
        <div>
          <label className="text-[13px] font-semibold text-tx-2" htmlFor="parecer-date">Data</label>
          <input id="parecer-date" name="date" type="date" defaultValue={dateInputValue(parecer?.date)} className="mobile-parecer-input" />
        </div>
        <div>
          <label className="text-[13px] font-semibold text-tx-2" htmlFor="parecer-description">Descrição</label>
          <textarea id="parecer-description" name="description" rows={4} defaultValue={parecer?.description || ""} placeholder="Descrição (opcional)" className="mobile-parecer-input" />
        </div>
        {error && <p className="text-sm text-urgente">{error}</p>}
      </div>
      <div className="fixed bottom-0 left-0 right-0 flex gap-2 p-3 bg-sf-superficie border-t border-regua" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" onClick={() => router.back()} className="flex-1 text-sm font-semibold text-tx-2 bg-sf-apoio py-2.5">Cancelar</button>
        <button type="submit" disabled={pending} className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 disabled:opacity-50">
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <style>{`.mobile-parecer-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.375rem; padding:0.55rem 0.7rem; font-size:0.9rem; background:var(--sf-superficie); color:var(--tx); margin-top:0.25rem; }`}</style>
    </form>
  );
}
