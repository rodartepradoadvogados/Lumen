import { FilePlus2, Send, ArrowUp, ArrowDown, CheckCircle2, MessageSquare, Bell, Upload } from "lucide-react";
import { EmptyState } from "@/components/ui";
import type { CaseTimelineEvent } from "@/lib/caseTimeline";

const ICONS: Record<CaseTimelineEvent["kind"], typeof FilePlus2> = {
  criado: FilePlus2,
  distribuido: Send,
  escalada: ArrowUp,
  retorno: ArrowDown,
  tarefa: CheckCircle2,
  comentario: MessageSquare,
  publicacao: Bell,
  protocolo: Upload,
};

function formatEventDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// 3º painel fixo da Visão Geral do Processo (320px, ao lado de Dados do processo/Partes e
// vínculos) — ver proposta de remodelação do portal: "requisito confirmado pelo cliente, não
// colapsar". Eventos vêm pré-montados por lib/caseTimeline.ts (buildCaseTimeline), mais
// recente primeiro.
export default function CaseTimeline({ events }: { events: CaseTimelineEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="Sem eventos ainda" subtitle="Movimentações do processo aparecem aqui" />;
  }

  return (
    <ol className="space-y-0">
      {events.map((ev, i) => {
        const Icon = ICONS[ev.kind];
        return (
          <li key={ev.id} className="relative pl-7 pb-4 last:pb-0">
            {i < events.length - 1 && <span className="absolute left-[10px] top-5 bottom-0 w-px bg-navy-800/10 dark:bg-white/10" />}
            <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-bordo-700/10 dark:bg-bordo-400/15 text-bordo-700 dark:text-bordo-400 flex items-center justify-center">
              <Icon size={11} strokeWidth={2.3} />
            </span>
            <p className="text-xs font-semibold text-navy-900 dark:text-cream-50 leading-snug">{ev.title}</p>
            <p className="text-[10px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">{formatEventDate(ev.date)}</p>
            {ev.detail && <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 mt-1 leading-snug">{ev.detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}
