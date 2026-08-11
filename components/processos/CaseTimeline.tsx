import { FilePlus, FileText, ArrowUp, ArrowDown, CircleCheck, MessageSquare, Bell, Clock, Gavel } from "lucide-react";
import { EmptyState } from "@/components/ui";
import type { CaseTimelineEvent } from "@/lib/caseTimeline";

// Chip 20×20, raio 4px, ícone 11px — DESIGN-SYSTEM.md §6. Cada tipo de evento tem cor própria;
// "publicacao" ainda se divide em Andamento x Publicação/intimação pelo texto do título, porque
// lib/caseTimeline.ts não carrega um kind separado para os dois.
const STYLE: Record<CaseTimelineEvent["kind"], { icon: typeof FilePlus; bg: string; text: string }> = {
  criado: { icon: FilePlus, bg: "bg-marca-bg", text: "text-marca-tx" },
  distribuido: { icon: Clock, bg: "bg-sf-apoio", text: "text-tx-2" },
  escalada: { icon: ArrowUp, bg: "bg-acao-bg", text: "text-acao" },
  retorno: { icon: ArrowDown, bg: "bg-sf-apoio", text: "text-tx-2" },
  tarefa: { icon: CircleCheck, bg: "bg-concluido-bg", text: "text-concluido" },
  comentario: { icon: MessageSquare, bg: "bg-sf-apoio", text: "text-tx-2" },
  publicacao: { icon: Bell, bg: "bg-urgente-bg", text: "text-urgente" },
  protocolo: { icon: FileText, bg: "bg-acao-bg", text: "text-acao" },
};

const ANDAMENTO_STYLE = { icon: Gavel, bg: "bg-sf-apoio", text: "text-tx-2" };

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
      {events.map((ev) => {
        const isAndamento = ev.kind === "publicacao" && ev.title.startsWith("Andamento");
        const { icon: Icon, bg, text } = isAndamento ? ANDAMENTO_STYLE : STYLE[ev.kind];
        return (
          <li key={ev.id} className="relative pl-7 pb-3 mb-3 border-b border-regua last:border-b-0 last:pb-0 last:mb-0">
            <span className={`absolute left-0 top-0.5 h-5 w-5 rounded flex items-center justify-center ${bg} ${text}`}>
              <Icon size={11} strokeWidth={2.3} />
            </span>
            <p className="text-xs font-semibold text-tx leading-snug">{ev.title}</p>
            <p className="text-[10px] text-tx-2 mt-0.5">{formatEventDate(ev.date)}</p>
            {ev.detail && <p className="text-[11px] text-tx-2 mt-1 leading-snug">{ev.detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}
