"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  markPublicationRead,
  markPublicationUnread,
  generateTaskFromPublication,
  setPublicationTriageStatus,
} from "@/lib/actions/publications";
import { Badge, formatDate } from "@/components/ui";
import PeticionarButton from "@/components/PeticionarButton";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import DelegateTaskForm from "@/components/DelegateTaskForm";
import { useUndoToast } from "@/components/UndoToastProvider";
import { Check, Undo2, CalendarClock, Gavel, Stethoscope, CalendarPlus, ListTodo, X, ChevronDown, FilePlus2, UserPlus } from "lucide-react";
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
  lawyerTag: string | null;
  processNumberRaw: string | null;
  case: { id: string; title: string; processNumber: string | null } | null;
  client: { id: string; name: string } | null;
  taskCount?: number;
  assignedToId: string | null;
  triageStatus: string;
};

const triageLabels: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANALISE: "Em análise",
  TRATADA: "Tratada",
};

const triageColors: Record<string, "amber" | "blue" | "green"> = {
  PENDENTE: "amber",
  EM_ANALISE: "blue",
  TRATADA: "green",
};

const actionButtons = [
  { type: "PRAZO", label: "Gerar Prazo", icon: CalendarClock },
  { type: "TAREFA", label: "Gerar Atividade", icon: ListTodo },
  { type: "AUDIENCIA", label: "Marcar Audiência", icon: Gavel },
  { type: "PERICIA", label: "Marcar Perícia", icon: Stethoscope },
  { type: "EVENTO", label: "Gerar Evento", icon: CalendarPlus },
];

export default function PublicationRow({ pub, users = [] }: { pub: Pub; users?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [detailOpen, setDetailOpen] = useState(false);
  const [formType, setFormType] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const assignedToName = users.find((u) => u.id === pub.assignedToId)?.name;
  const { showUndo } = useUndoToast();

  useEffect(() => {
    if (!agendaOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAgendaOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [agendaOpen]);

  function markRead() {
    setLoading(true);
    markPublicationRead(pub.id).then(() => {
      router.refresh();
      setLoading(false);
      showUndo({
        message: "Publicação marcada como lida.",
        onUndo: async () => {
          await markPublicationUnread(pub.id);
          router.refresh();
        },
      });
    });
  }

  function markUnread() {
    setLoading(true);
    markPublicationUnread(pub.id).then(() => {
      router.refresh();
      setLoading(false);
    });
  }

  function pickAction(type: string) {
    setAgendaOpen(false);
    setFormType(type);
  }

  function handleTriage(status: string) {
    setLoading(true);
    setPublicationTriageStatus(pub.id, status).then(() => {
      router.refresh();
      setLoading(false);
    });
  }

  return (
    <div className="px-5 py-4 relative">
      {pub.case && !!pub.taskCount && (
        <Link
          href={`/processos/${pub.case.id}?tab=atividades`}
          onClick={(e) => e.stopPropagation()}
          data-tip="Ver atividades vinculadas a esta publicação"
          className="absolute right-7 top-4 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 z-10"
        >
          {pub.taskCount}
        </Link>
      )}
      <button onClick={() => setDetailOpen(true)} className="block w-full text-left relative pr-7">
        <ChevronDown
          size={16}
          className={clsx(
            "absolute right-0 top-0.5 text-navy-800/30 dark:text-cream-50/30 transition-transform",
            detailOpen && "rotate-180"
          )}
        />
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
            {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento Processual"}
          </Badge>
          <Badge color="navy">{pub.source}</Badge>
          {pub.lawyerTag && <Badge color="gold">{pub.lawyerTag}</Badge>}
          {!pub.read && <Badge color="gold">Não lida</Badge>}
          {pub.deadlineGenerated && <Badge color="green">Compromisso gerado</Badge>}
          <Badge color={triageColors[pub.triageStatus] || "amber"}>{triageLabels[pub.triageStatus] || pub.triageStatus}</Badge>
          <span className="text-xs text-navy-800/40 dark:text-cream-50/40">{formatDate(pub.publishedAt)}</span>
        </div>
        {pub.case && <p className="text-xs font-medium text-gold-700 dark:text-gold-400">{pub.case.title}</p>}
        {!pub.case && pub.client && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Cliente compatível: {pub.client.name}</p>}
        <p className="text-sm text-navy-800 dark:text-cream-50/80 mt-1 line-clamp-2">{pub.content}</p>
      </button>

      <div className="flex items-center gap-2 mt-2.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {!pub.read ? (
          <button
            onClick={markRead}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 dark:text-cream-50/60 dark:hover:text-cream-50 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200 dark:bg-white/10 dark:hover:bg-white/15"
          >
            <Check size={12} /> Marcar como lida
          </button>
        ) : (
          <button
            onClick={markUnread}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 dark:text-cream-50/60 dark:hover:text-cream-50 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200 dark:bg-white/10 dark:hover:bg-white/15"
          >
            <Undo2 size={12} /> Marcar como não lida
          </button>
        )}

        {pub.case && (
          <Link href={`/processos/${pub.case.id}`} className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 dark:text-cream-50/60 dark:hover:text-cream-50 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200 dark:bg-white/10 dark:hover:bg-white/15">
            Abrir Processo
          </Link>
        )}
        {!pub.case && pub.client && (
          <Link href={`/contatos/clientes#client-${pub.client.id}`} className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-400/15 dark:hover:bg-emerald-400/25">
            Abrir Cadastro do Cliente
          </Link>
        )}
        {!pub.case && pub.processNumberRaw && (
          <Link
            href={`/processos/novo?type=JUDICIAL&processNumber=${encodeURIComponent(pub.processNumberRaw)}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 dark:text-cream-50/60 dark:hover:text-cream-50 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200 dark:bg-white/10 dark:hover:bg-white/15"
          >
            <FilePlus2 size={12} /> Cadastrar Processo
          </Link>
        )}

        <PeticionarButton compact caseId={pub.case?.id} />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setAgendaOpen((o) => !o)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gold-800 hover:text-gold-900 dark:text-gold-400 dark:hover:text-gold-300 px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 dark:bg-gold-400/15 dark:hover:bg-gold-400/25"
          >
            <CalendarClock size={12} /> Agenda <ChevronDown size={11} />
          </button>
          {agendaOpen && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-navy-900 rounded-lg border border-navy-800/10 dark:border-white/10 shadow-pop z-20 overflow-hidden">
              {actionButtons.map((a) => (
                <button
                  key={a.type}
                  onClick={() => pickAction(a.type)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-900 dark:text-cream-50 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors"
                >
                  <a.icon size={13} /> {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {assignedToName && (
          <span
            data-tip="Responsável pela triagem"
            className="text-[11px] font-medium text-navy-800/50 dark:text-cream-50/50 px-2 py-1 rounded-lg bg-cream-100 dark:bg-white/5"
          >
            Responsável: {assignedToName}
          </span>
        )}
        {users.length > 0 && (
          <button
            type="button"
            onClick={() => setDelegateOpen(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gold-800 hover:text-gold-900 dark:text-gold-400 dark:hover:text-gold-300 px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20 dark:bg-gold-400/15 dark:hover:bg-gold-400/25"
          >
            <UserPlus size={12} /> Delegar
          </button>
        )}

        <select
          value={pub.triageStatus}
          disabled={loading}
          onChange={(e) => handleTriage(e.target.value)}
          data-tip="Status da triagem"
          className="text-[11px] font-semibold text-navy-800/70 dark:text-cream-50/70 px-2 py-1 rounded-lg bg-cream-100 dark:bg-navy-800 border border-navy-800/10 dark:border-white/15 cursor-pointer disabled:opacity-50"
        >
          <option value="PENDENTE">Pendente</option>
          <option value="EM_ANALISE">Em análise</option>
          <option value="TRATADA">Tratada</option>
        </select>
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
          className="mt-3 p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input name="title" defaultValue={`${pub.content.slice(0, 50)}`} required className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5" />
          <div className="flex gap-2 flex-wrap">
            <select name="type" defaultValue={formType} className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5">
              <option value="PRAZO">Prazo</option>
              <option value="TAREFA">Atividade/Tarefa</option>
              <option value="AUDIENCIA">Audiência</option>
              <option value="PERICIA">Perícia</option>
              <option value="EVENTO">Evento</option>
            </select>
            <input name="dueDate" type="date" required className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5" />
            <input name="dueTime" type="time" className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5" />
            <select name="priority" className="text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5" defaultValue="ALTA">
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
            <button type="button" onClick={() => setFormType(null)} className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {detailOpen && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setDetailOpen(false)}>
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">
                {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento Processual"}
              </h3>
              <button onClick={() => setDetailOpen(false)} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color="navy">{pub.source}</Badge>
                <span className="text-xs text-navy-800/40 dark:text-cream-50/40">{formatDate(pub.publishedAt)}</span>
              </div>
              {pub.case && (
                <div>
                  <Link href={`/processos/${pub.case.id}`} className="text-sm font-medium text-gold-700 dark:text-gold-400 hover:underline block">
                    {pub.case.title}
                  </Link>
                  {pub.case.processNumber && <ProcessNumberChip processNumber={pub.case.processNumber} />}
                </div>
              )}
              {!pub.case && pub.client && (
                <Link href={`/contatos/clientes#client-${pub.client.id}`} className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline block">
                  Cliente: {pub.client.name}
                </Link>
              )}
              <p className={clsx("text-sm text-navy-800 dark:text-cream-50/80 whitespace-pre-wrap")}>{pub.content}</p>
            </div>
          </div>
        </div>
      )}

      {delegateOpen && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setDelegateOpen(false)}>
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Delegar publicação</h3>
              <button onClick={() => setDelegateOpen(false)} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>
            <DelegateTaskForm
              users={users}
              initial={{
                publicationId: pub.id,
                title: pub.content.slice(0, 50),
                referTo: pub.case ? "PROCESSO" : "OUTROS",
                selectedLink: pub.case ? { id: pub.case.id, label: pub.case.title } : undefined,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
