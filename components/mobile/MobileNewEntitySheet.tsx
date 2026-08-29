"use client";

import Link from "next/link";
import { X, Phone, Scale, Briefcase, Building2, CalendarClock, ListTodo, Gavel, Stethoscope, CalendarCheck2, type LucideIcon } from "lucide-react";
import type { OfficeModules } from "@/lib/officeModules";

// Menu do "+" central da barra inferior (components/mobile/MobileBottomNav.tsx) — antes ia
// direto para Novo Atendimento, sem opção de escolher; pedido do dono do produto: "o botão de +
// tinha que dar a opção de escolher o que adicionar". Dois blocos, mesma divisão do menu "+Novo"
// do desktop (components/NewEntityMenu.tsx) mais a parte de compromissos que lá vive separada,
// no "Criar tarefa com prazo"/NewTaskModal — aqui juntos num só lugar, porque no app mobile o "+"
// é o único ponto de entrada para lançar qualquer coisa nova.
type Item = { href: string; label: string; icon: LucideIcon };

const CADASTRO_ITEMS = (modules: OfficeModules): Item[] => [
  ...(modules.atendimento ? [{ href: "/m/atendimento/novo", label: "Atendimento", icon: Phone }] : []),
  { href: "/m/processos/novo?type=JUDICIAL", label: "Processo", icon: Scale },
  { href: "/m/processos/novo?type=EXTRAJUDICIAL", label: "Caso", icon: Briefcase },
  ...(modules.assessoria ? [{ href: "/m/assessoria/novo", label: "Assessoria", icon: Building2 }] : []),
];

const COMPROMISSO_ITEMS: Item[] = [
  { href: "/m/agenda?novo=1&tipo=PRAZO", label: "Prazo", icon: CalendarClock },
  { href: "/m/agenda?novo=1&tipo=TAREFA", label: "Tarefa", icon: ListTodo },
  { href: "/m/agenda?novo=1&tipo=AUDIENCIA", label: "Audiência", icon: Gavel },
  { href: "/m/agenda?novo=1&tipo=PERICIA", label: "Perícia", icon: Stethoscope },
  { href: "/m/agenda?novo=1&tipo=EVENTO", label: "Evento", icon: CalendarCheck2 },
];

export default function MobileNewEntitySheet({
  open,
  onClose,
  modules,
}: {
  open: boolean;
  onClose: () => void;
  modules: OfficeModules;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-sf shadow-pop w-full sm:max-w-md rounded-t-2xl sm:rounded-lg max-h-[85vh] flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-regua shrink-0">
          <h3 className="font-bold text-tx text-sm">Novo</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto scrollbar-thin p-4 space-y-5">
          <EntityGroup label="Cadastro" items={CADASTRO_ITEMS(modules)} onClose={onClose} />
          <EntityGroup label="Compromisso" items={COMPROMISSO_ITEMS} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

function EntityGroup({ label, items, onClose }: { label: string; items: Item[]; onClose: () => void }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-tx-2 mb-2 px-0.5">{label}</p>
      <div className="grid grid-cols-4 gap-2">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className="flex flex-col items-center gap-1.5 py-2 rounded-md hover:bg-sf-apoio transition-colors"
          >
            <span className="h-12 w-12 rounded-full bg-sf-apoio flex items-center justify-center text-tx">
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span className="text-[11px] font-medium text-tx-2 text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
