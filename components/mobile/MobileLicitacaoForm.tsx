"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLicitacao, updateLicitacao, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import MoneyInput from "@/components/MoneyInput";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;
type Licitacao = Assessoria["licitacoes"][number];

function dateInputValue(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

// Formulário de criar/editar Licitação no app — página própria (não modal): o formulário do site
// (desktop) é um modal centralizado, mas no celular um formulário com 8 campos não cabe numa
// janela pequena no meio da tela; página inteira com barra "Salvar" fixa embaixo é o padrão já
// usado em /m/processos/novo e afins.
export default function MobileLicitacaoForm({
  assessoriaId,
  licitacao,
}: {
  assessoriaId: string;
  // Ausente = criar; presente = editar esta licitação.
  licitacao?: Licitacao;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    const payload = {
      nome: String(formData.get("nome") || ""),
      objeto: String(formData.get("objeto") || ""),
      orgao: String(formData.get("orgao") || ""),
      modalidade: String(formData.get("modalidade") || "") || undefined,
      dataAbertura: String(formData.get("dataAbertura") || "") || undefined,
      prazoFinal: String(formData.get("prazoFinal") || "") || undefined,
      valorEstimado: String(formData.get("valorEstimado") || "") || undefined,
      editalUrl: String(formData.get("editalUrl") || "") || undefined,
    };
    startTransition(async () => {
      const result = licitacao ? await updateLicitacao(licitacao.id, payload) : await addLicitacao(assessoriaId, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(licitacao ? `/m/assessoria/${assessoriaId}/licitacoes/${licitacao.id}` : `/m/assessoria/${assessoriaId}`);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col" style={{ minHeight: "calc(100dvh - 3.5rem)" }}>
      <div className="flex-1 p-4 space-y-3 pb-24">
        <div>
          <label className="text-xs font-semibold text-tx-2">Nome da licitação</label>
          <input name="nome" required defaultValue={licitacao?.nome || ""} placeholder="Ex: Pregão 014/2026 — Locação de Veículos" className="mobile-lic-input" />
          <p className="text-[11px] text-tx-3 mt-1">Aparece na lista e vira o nome da pasta no Drive.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Objeto</label>
          <textarea name="objeto" required rows={3} defaultValue={licitacao?.objeto || ""} placeholder="Texto completo do edital" className="mobile-lic-input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Órgão</label>
          <input name="orgao" required defaultValue={licitacao?.orgao || ""} className="mobile-lic-input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Modalidade</label>
          <input name="modalidade" defaultValue={licitacao?.modalidade || ""} placeholder="Ex: Pregão Eletrônico 014/2026" className="mobile-lic-input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Abertura</label>
          <input name="dataAbertura" type="date" defaultValue={dateInputValue(licitacao?.dataAbertura)} className="mobile-lic-input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Prazo final</label>
          <input name="prazoFinal" type="date" defaultValue={dateInputValue(licitacao?.prazoFinal)} className="mobile-lic-input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Valor estimado (R$)</label>
          <MoneyInput name="valorEstimado" defaultValue={licitacao?.valorEstimado != null ? String(licitacao.valorEstimado) : undefined} className="mobile-lic-input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-tx-2">Link do edital (Drive)</label>
          <input name="editalUrl" type="url" defaultValue={licitacao?.editalUrl || ""} placeholder="https://..." className="mobile-lic-input" />
        </div>
        {error && <p className="text-sm text-urgente">{error}</p>}
      </div>
      <div className="fixed bottom-0 left-0 right-0 flex gap-2 p-3 bg-sf-superficie border-t border-regua" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" onClick={() => router.back()} className="flex-1 text-sm font-semibold text-tx-2 bg-sf-apoio py-2.5">Cancelar</button>
        <button type="submit" disabled={pending} className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 disabled:opacity-50">
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <style>{`.mobile-lic-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.375rem; padding:0.55rem 0.7rem; font-size:0.9rem; background:var(--sf-superficie); color:var(--tx); margin-top:0.25rem; }`}</style>
    </form>
  );
}
