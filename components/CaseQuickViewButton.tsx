"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";
import SlideDrawer from "@/components/motion/SlideDrawer";
import { getCaseQuickView, type CaseQuickView } from "@/lib/actions/caseQuickView";
import { Badge, formatCurrency } from "@/components/ui";
import { PRAZO_URGENCIA_TEXT, PRAZO_URGENCIA_LABEL } from "@/lib/dueStatus";
import { formatRelativeDueDate } from "@/lib/formatRelativeDueDate";

// Movimento 1 · deslizar (proposta "Movimento & Prazos" / artefato "Slide & Sumir") — primeiro
// uso real do SlideDrawer (components/motion/SlideDrawer.tsx), reservado desde a entrega
// original exatamente para um painel NOVO como este, em vez de converter um modal já existente
// (ModalShell/TaskDetailModal continuam intocados). A ficha abre ao lado da lista de Processos
// sem navegar para outra rota — fechar volta pro mesmo lugar da lista, com filtro/scroll
// intactos. "Abrir processo completo" (link no fim) é a saída para quem precisa editar algo.
export default function CaseQuickViewButton({ caseId, caseTitle }: { caseId: string; caseTitle: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CaseQuickView | null>(null);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    const result = await getCaseQuickView(caseId);
    setData(result);
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        data-tip="Ficha rápida"
        className="p-1.5 text-tx-3 hover:text-acao hover:bg-acao-bg transition-colors rounded-md"
      >
        <Eye size={15} />
      </button>
      {open && (
        <SlideDrawer title="Ficha rápida" subtitle={caseTitle} onClose={() => setOpen(false)}>
          <div className="p-5 flex flex-col gap-4">
            {loading && <p className="text-sm text-tx-2">Carregando...</p>}
            {!loading && data && "error" in data && <p className="text-sm text-urgente">{data.error}</p>}
            {!loading && data && !("error" in data) && (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge color="slate">{data.naturezaLabel}</Badge>
                  <Badge color="slate">{data.status}</Badge>
                  {data.materias.map((m) => (
                    <Badge key={m} color="slate">
                      {m}
                    </Badge>
                  ))}
                </div>
                {data.processNumber && (
                  <Field label="Número">
                    {data.processNumber}
                    {data.tribunalSigla ? ` · ${data.tribunalSigla}` : ""}
                  </Field>
                )}
                {data.clientsLabel && <Field label="Cliente(s)">{data.clientsLabel}</Field>}
                {data.partiesLabel && <Field label="Parte adversa">{data.partiesLabel}</Field>}
                <Field label="Responsável">{data.responsibleName ?? "Sem responsável"}</Field>
                {data.caseValue != null && <Field label="Valor da causa">{formatCurrency(data.caseValue)}</Field>}
                <Field label="Tarefas">{data.taskCount}</Field>
                <Field label="Próximo prazo">
                  {data.nextTask ? (
                    <span className={PRAZO_URGENCIA_TEXT[data.nextTask.urgencia]}>
                      {data.nextTask.title} — {formatRelativeDueDate(data.nextTask.dueDate)} (
                      {PRAZO_URGENCIA_LABEL[data.nextTask.urgencia]})
                    </span>
                  ) : (
                    "Nenhum prazo pendente"
                  )}
                </Field>
                <div className="pt-2 mt-1 border-t border-regua">
                  <Link
                    href={`/processos/${caseId}`}
                    className="flex items-center justify-center gap-1.5 text-sm font-semibold text-acao hover:underline py-1"
                  >
                    Abrir processo completo <ArrowRight size={14} />
                  </Link>
                </div>
              </>
            )}
          </div>
        </SlideDrawer>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-tx-3 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-tx mt-0.5">{children}</p>
    </div>
  );
}
