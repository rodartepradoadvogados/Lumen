"use client";

import { useMemo, useState, useTransition } from "react";
import { addDocumento, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Badge, formatDate } from "@/components/ui";
import { Plus } from "lucide-react";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

const DOC_TYPES: Record<string, { label: string; color: "slate" | "amber" | "bordo" | "green" }> = {
  CONTRATO: { label: "Contrato", color: "slate" },
  PARECER: { label: "Parecer", color: "slate" },
  ACAO_VINCULADA: { label: "Ação vinculada", color: "amber" },
  LICITACAO: { label: "Licitação", color: "bordo" },
  REGIMENTO_INTERNO: { label: "Regimento Interno", color: "green" },
  OUTRO: { label: "Outro", color: "slate" },
};

export default function AssessoriaDocumentosTab({ assessoria }: { assessoria: Assessoria }) {
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (typeFilter === "TODOS" ? assessoria.documents : assessoria.documents.filter((d) => d.docType === typeFilter)),
    [assessoria.documents, typeFilter]
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addDocumento(assessoria.id, {
        name: String(formData.get("name") || ""),
        docType: String(formData.get("docType") || "OUTRO"),
        driveUrl: String(formData.get("driveUrl") || ""),
        date: String(formData.get("date") || ""),
      });
      if (result.error) setError(result.error);
      else setFormOpen(false);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-3 py-1.5"
        >
          <option value="TODOS">Todos os tipos</option>
          {Object.entries(DOC_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-3 py-1.5 rounded-lg"
        >
          <Plus size={14} /> Novo documento
        </button>
      </div>

      {formOpen && (
        <form
          action={handleSubmit}
          className="mb-4 p-4 rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-50 dark:bg-navy-800 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="name" required placeholder="Nome do documento" className="doc-input" />
            <select name="docType" defaultValue="CONTRATO" className="doc-input">
              {Object.entries(DOC_TYPES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="driveUrl" required type="url" placeholder="Link do Google Drive" className="doc-input" />
            <input name="date" type="date" className="doc-input" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
              Cancelar
            </button>
          </div>
          <style>{`.doc-input { width:100%; border:1px solid rgba(15,31,61,0.12); border-radius:0.5rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:#fff; } .dark .doc-input { border-color: rgba(255,255,255,0.15); background:#0f1f3d; color:#fbfaf7; }`}</style>
        </form>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-navy-800/40 dark:text-cream-50/40 py-8 text-center">Nenhum documento neste filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 border-b border-navy-800/10 dark:border-white/10">
                <th className="pb-2 pr-3">Nome</th>
                <th className="pb-2 pr-3">Tipo</th>
                <th className="pb-2 pr-3">Data</th>
                <th className="pb-2 pr-3">Vinculado a</th>
                <th className="pb-2 pr-3">Enviado por</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td className="py-2.5 pr-3 font-medium text-navy-900 dark:text-cream-50">{d.name}</td>
                  <td className="py-2.5 pr-3"><Badge color={DOC_TYPES[d.docType]?.color || "slate"}>{DOC_TYPES[d.docType]?.label || d.docType}</Badge></td>
                  <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{formatDate(d.date)}</td>
                  <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{d.case?.title || "—"}</td>
                  <td className="py-2.5 pr-3 text-navy-800/60 dark:text-cream-50/60">{d.uploadedBy?.name || "—"}</td>
                  <td className="py-2.5">
                    <a href={d.driveUrl} target="_blank" rel="noopener noreferrer" className="text-gold-600 dark:text-gold-400 font-semibold text-xs">
                      ↗ Abrir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
