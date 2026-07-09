"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPublicationRead, generateTaskFromPublication } from "@/lib/actions/publications";
import { Badge, formatDate } from "@/components/ui";
import { Check, CalendarClock, Gavel, Stethoscope, CalendarPlus, ListTodo, X } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  deadlineGenerated: boolean;
  case: { id: string; title: string } | null;
};

const actionButtons = [
  { type: "PRAZO", label: "Gerar Prazo", icon: CalendarClock },
  { type: "TAREFA", label: "Gerar Atividade", icon: ListTodo },
  { type: "AUDIENCIA", label: "Marcar Audiência", icon: Gavel },
  { type: "PERICIA", label: "Marcar Perícia", icon: Stethoscope },
  { type: "EVENTO", label: "Gerar Evento", icon: CalendarPlus },
];

export default function PublicationRow({ pub }: { pub: Pub }) {
  const router = useRouter();
  const [detailOpen, setDetailOpen] = useState(false);
  const [formType, setFormType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function markRead() {
    setLoading(true);
    markPublicationRead(pub.id).then(() => {
      router.refresh();
      setLoading(false);
    });
  }

  return (
    <div className="px-5 py-4">
      <button onClick={() => setDetailOpen(true)} className="block w-full text-left">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
            {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento Processual"}
          </Badge>
          <Badge color="navy">{pub.source}</Badge>
          {!pub.read && <Badge color="gold">Não lida</Badge>}
          {pub.deadlineGenerated && <Badge color="green">Compromisso gerado</Badge>}
          <span className="text-xs text-navy-800/40">{formatDate(pub.publishedAt)}</span>
        </div>
        {pub.case && <p className="text-xs font-medium text-gold-700">{pub.case.title}</p>}
        <p className="text-sm text-navy-800 mt-1 line-clamp-2">{pub.content}</p>
      </button>

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {!pub.read && (
          <button
            onClick={markRead}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200"
          >
            <Check size={12} /> Marcar como lida
          </button>
        )}
        {actionButtons.map((a) => (
          <button
            key={a.type}
            onClick={() => setFormType(a.type)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gold-800 hover:text-gold-900 px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20"
          >
            <a.icon size={12} /> {a.label}
          </button>
        ))}
      </div>

      {formType && (
        <form
          action={async (formData) => {
            setLoading(true);
            await generateTaskFromPublication(pub.id, {
              title: String(formData.get("title")),
              type: String(formData.get("type")),
              dueDate: String(formData.get("dueDate")),
              dueTime: String(formData.get("dueTime") || ""),
              priority: String(formData.get("priority")),
            });
            setFormType(null);
            setLoading(false);
            router.refresh();
          }}
          className="mt-3 p-3 rounded-lg bg-cream-50 border border-navy-800/8 space-y-2"
        >
          <input name="title" defaultValue={`${pub.content.slice(0, 50)}`} required className="w-full text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
          <div className="flex gap-2 flex-wrap">
            <select name="type" defaultValue={formType} className="text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5">
              <option value="PRAZO">Prazo</option>
              <option value="TAREFA">Atividade/Tarefa</option>
              <option value="AUDIENCIA">Audiência</option>
              <option value="PERICIA">Perícia</option>
              <option value="EVENTO">Evento</option>
            </select>
            <input name="dueDate" type="date" required className="text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
            <input name="dueTime" type="time" className="text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
            <select name="priority" className="text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" defaultValue="ALTA">
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="flex-1 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
              {loading ? "Criando..." : "Criar na Agenda/Kanban"}
            </button>
            <button type="button" onClick={() => setFormType(null)} className="px-3 text-xs font-semibold text-navy-800/50 hover:text-navy-900">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setDetailOpen(false)}>
          <div className="bg-white rounded-xl shadow-pop w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <h3 className="font-serif font-bold text-navy-900">
                {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento Processual"}
              </h3>
              <button onClick={() => setDetailOpen(false)} className="text-navy-800/40 hover:text-navy-900">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color="navy">{pub.source}</Badge>
                <span className="text-xs text-navy-800/40">{formatDate(pub.publishedAt)}</span>
              </div>
              {pub.case && (
                <Link href={`/processos/${pub.case.id}`} className="text-sm font-medium text-gold-700 hover:underline block">
                  {pub.case.title}
                </Link>
              )}
              <p className={clsx("text-sm text-navy-800 whitespace-pre-wrap")}>{pub.content}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
