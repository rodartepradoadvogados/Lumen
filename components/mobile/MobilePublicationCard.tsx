"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  markPublicationRead,
  markPublicationUnread,
  generateTaskFromPublication,
} from "@/lib/actions/publications";
import { Badge, formatDate } from "@/components/ui";
import DelegateTaskForm from "@/components/DelegateTaskForm";
import LinkPublicationMenu from "@/components/LinkPublicationMenu";
import CopyButton from "@/components/CopyButton";
import { useUndoToast } from "@/components/UndoToastProvider";
import {
  Check,
  CalendarClock,
  Gavel,
  Stethoscope,
  CalendarPlus,
  ListTodo,
  ChevronDown,
  UserPlus,
  X,
} from "lucide-react";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  caseId: string | null;
  caseTitle: string | null;
  clientId?: string | null;
  clientName?: string | null;
  processNumberRaw?: string | null;
  assignedToId?: string | null;
};

const actionButtons = [
  { type: "PRAZO", label: "Gerar Prazo", icon: CalendarClock },
  { type: "TAREFA", label: "Gerar Atividade", icon: ListTodo },
  { type: "AUDIENCIA", label: "Marcar Audiência", icon: Gavel },
  { type: "PERICIA", label: "Marcar Perícia", icon: Stethoscope },
  { type: "EVENTO", label: "Gerar Evento", icon: CalendarPlus },
];

export default function MobilePublicationCard({ pub, users = [] }: { pub: Pub; users?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [formType, setFormType] = useState<string | null>(null);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showUndo } = useUndoToast();

  function markRead() {
    startTransition(async () => {
      await markPublicationRead(pub.id);
      router.refresh();
      showUndo({
        message: "Publicação marcada como lida.",
        onUndo: async () => {
          await markPublicationUnread(pub.id);
          router.refresh();
        },
      });
    });
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
          {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento"}
        </Badge>
        <Badge color="navy">{pub.source}</Badge>
        <span className="text-xs text-navy-800/40">{formatDate(pub.publishedAt)}</span>
      </div>

      {pub.caseId && pub.caseTitle && (
        <Link href={`/m/processos/${pub.caseId}`} className="text-xs font-medium text-gold-700 dark:text-gold-400 block mb-1">
          {pub.caseTitle}
        </Link>
      )}
      {!pub.caseId && pub.clientId && pub.clientName && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Cliente compatível: {pub.clientName}</p>
      )}

      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm text-navy-800 dark:text-cream-50/85 ${expanded ? "" : "line-clamp-3"}`}>{pub.content}</p>
        <CopyButton
          text={pub.content}
          label="Copiar conteúdo"
          showLabel={false}
          className="shrink-0 p-1.5 rounded-lg text-navy-800/40 dark:text-cream-50/40 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors"
        />
      </div>
      {pub.content.length > 140 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 mt-1"
        >
          {expanded ? "Ver menos" : "Ver mais"}
        </button>
      )}

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        <button
          type="button"
          disabled={pending}
          onClick={markRead}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-800/70 dark:text-cream-50/70 px-3 py-1.5 rounded-lg bg-cream-100 dark:bg-white/5 hover:bg-cream-200 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <Check size={13} /> {pending ? "Marcando..." : "Marcar como lida"}
        </button>

        {pub.caseId && (
          <Link
            href={`/m/processos/${pub.caseId}`}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-800/70 dark:text-cream-50/70 px-3 py-1.5 rounded-lg bg-cream-100 dark:bg-white/5 hover:bg-cream-200 dark:hover:bg-white/10"
          >
            Abrir Processo
          </Link>
        )}
        {/* "Abrir Cadastro do Cliente" fica de fora do app mobile de propósito — não existe
            tela de detalhe de cliente em /m ainda (mesmo motivo de MobileGlobalSearch
            descartar resultados do tipo "Clientes"). O app nunca deve levar pro site desktop. */}
        {!pub.caseId && (
          <LinkPublicationMenu
            publicationId={pub.id}
            newCaseHref={`/m/processos/novo?type=JUDICIAL${pub.processNumberRaw ? `&processNumber=${encodeURIComponent(pub.processNumberRaw)}` : ""}`}
          />
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setAgendaOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold-800 dark:text-gold-400 px-3 py-1.5 rounded-lg bg-gold-500/10 dark:bg-gold-400/15"
          >
            <CalendarClock size={13} /> Agenda <ChevronDown size={12} />
          </button>
          {agendaOpen && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-navy-900 rounded-lg border border-navy-800/10 dark:border-white/10 shadow-pop z-20 overflow-hidden">
              {actionButtons.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => {
                    setAgendaOpen(false);
                    setFormType(a.type);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-navy-900 dark:text-cream-50 hover:bg-cream-50 dark:hover:bg-white/5"
                >
                  <a.icon size={13} /> {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {users.length > 0 && (
          <button
            type="button"
            onClick={() => setDelegateOpen(true)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold-800 dark:text-gold-400 px-3 py-1.5 rounded-lg bg-gold-500/10 dark:bg-gold-400/15"
          >
            <UserPlus size={13} /> Delegar
          </button>
        )}
      </div>

      {formType && (
        <form
          action={async (formData) => {
            await generateTaskFromPublication(pub.id, {
              title: String(formData.get("title")),
              type: String(formData.get("type")),
              dueDate: String(formData.get("dueDate")),
              dueTime: String(formData.get("dueTime") || ""),
              priority: "MEDIA",
            });
            setFormType(null);
            router.refresh();
          }}
          className="mt-3 p-3 rounded-lg bg-cream-50 dark:bg-navy-800 border border-navy-800/8 dark:border-white/10 space-y-2"
        >
          <input name="title" defaultValue={pub.content.slice(0, 50)} required className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg px-2.5 py-1.5" />
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
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold py-1.5 rounded-lg">
              Criar na Agenda/Kanban
            </button>
            <button type="button" onClick={() => setFormType(null)} className="px-3 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
              Cancelar
            </button>
          </div>
        </form>
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
                referTo: pub.caseId ? "PROCESSO" : "OUTROS",
                selectedLink: pub.caseId && pub.caseTitle ? { id: pub.caseId, label: pub.caseTitle } : undefined,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
