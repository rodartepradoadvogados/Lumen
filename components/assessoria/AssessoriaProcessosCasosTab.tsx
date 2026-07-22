"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setCaseAssessoria, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { Badge, formatDate } from "@/components/ui";
import { Plus, Link2 } from "lucide-react";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;
type CaseOption = { id: string; title: string; processNumber: string | null };

const caseStatusColors: Record<string, "green" | "slate" | "bordo" | "amber"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "slate",
};
const caseStatusLabels: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado", ARQUIVADO: "Arquivado" };

export default function AssessoriaProcessosCasosTab({
  assessoria,
  availableCases,
}: {
  assessoria: Assessoria;
  availableCases: CaseOption[];
}) {
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pareceres = assessoria.documents.filter((d) => d.docType === "PARECER");

  function handleLink(formData: FormData) {
    setError(null);
    const caseId = String(formData.get("caseId") || "");
    if (!caseId) {
      setError("Selecione um processo.");
      return;
    }
    startTransition(async () => {
      const result = await setCaseAssessoria(caseId, assessoria.id);
      if (result.error) setError(result.error);
      else setLinkFormOpen(false);
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">Pareceres</h4>
        {pareceres.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">
            Nenhum parecer cadastrado ainda. Adicione pela aba Documentos (tipo &quot;Parecer&quot;).
          </p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {pareceres.map((d) => (
              <a
                key={d.id}
                href={d.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-between items-center gap-3 py-2 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
              >
                <span className="font-medium text-navy-900 dark:text-cream-50">{d.name}</span>
                <span className="text-navy-800/45 dark:text-cream-50/45 whitespace-nowrap text-xs">{formatDate(d.date)}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Processos vinculados</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLinkFormOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg"
            >
              <Link2 size={13} /> Vincular processo existente
            </button>
            <Link
              href={`/processos/novo?assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg"
            >
              <Plus size={13} /> Novo processo
            </Link>
          </div>
        </div>

        {linkFormOpen && (
          <form action={handleLink} className="mb-3 p-3 rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-50 dark:bg-navy-800 flex flex-wrap gap-2 items-center">
            {availableCases.length === 0 ? (
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50">Não há processos disponíveis para vincular.</p>
            ) : (
              <>
                <select name="caseId" defaultValue="" className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-lg px-3 py-1.5 flex-1 min-w-[220px]">
                  <option value="">Selecione um processo...</option>
                  {availableCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.processNumber ? ` — ${c.processNumber}` : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {pending ? "Vinculando..." : "Vincular"}
                </button>
              </>
            )}
            <button type="button" onClick={() => setLinkFormOpen(false)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
              Cancelar
            </button>
            {error && <p className="text-xs text-red-600 w-full">{error}</p>}
          </form>
        )}

        {assessoria.linkedCases.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum processo vinculado a esta empresa ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedCases.map((c) => (
              <Link
                key={c.id}
                href={`/processos/${c.id}`}
                className="flex justify-between gap-3 py-2 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
              >
                <span className="font-medium text-navy-900 dark:text-cream-50 underline decoration-navy-900/20 dark:decoration-cream-50/20">{c.title}</span>
                <Badge color={caseStatusColors[c.status] || "slate"}>{caseStatusLabels[c.status] || c.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">Casos (atendimentos) vinculados</h4>
        {assessoria.linkedAttendances.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum atendimento vinculado a esta assessoria ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedAttendances.map((a) => (
              <Link
                key={a.id}
                href={`/atendimento/${a.id}`}
                className="flex justify-between gap-3 py-2 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
              >
                <span className="font-medium text-navy-900 dark:text-cream-50 underline decoration-navy-900/20 dark:decoration-cream-50/20 truncate">{a.subject}</span>
                <span className="text-navy-800/45 dark:text-cream-50/45 whitespace-nowrap">{formatDate(a.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
