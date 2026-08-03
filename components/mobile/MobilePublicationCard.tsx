"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  markPublicationsRead,
  markPublicationsUnread,
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
  Layers,
  UserPlus,
  X,
} from "lucide-react";
import type { PublicationGroup } from "@/lib/publicationGrouping";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  caseId: string | null;
  caseTitle: string | null;
  clientId?: string | null;
  clientName?: string | null;
  processNumberRaw: string | null;
  assignedToId?: string | null;
};

const actionButtons = [
  { type: "PRAZO", label: "Gerar Prazo", icon: CalendarClock },
  { type: "TAREFA", label: "Gerar Atividade", icon: ListTodo },
  { type: "AUDIENCIA", label: "Marcar Audiência", icon: Gavel },
  { type: "PERICIA", label: "Marcar Perícia", icon: Stethoscope },
  { type: "EVENTO", label: "Gerar Evento", icon: CalendarPlus },
];

// Mesmo critério do desktop (components/PublicationRow.tsx): recebe o GRUPO inteiro (uma ou mais
// publicações do mesmo processo — ver lib/publicationGrouping.ts). O card mostra o item
// "primary" (fonte de maior prioridade), com um selo "+N outras fontes" quando o processo tem
// mais de uma; marcar como lida afeta TODOS os itens do grupo.
export default function MobilePublicationCard({ group, users = [] }: { group: PublicationGroup<Pub>; users?: { id: string; name: string }[] }) {
  const router = useRouter();
  const pub = group.primary;
  const groupIds = group.items.map((i) => i.id);
  const hasMultiple = group.items.length > 1;

  const [open, setOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  // "Gerar Prazo"/"Marcar Audiência"/etc. no menu Agenda pré-selecionam o tipo e abrem o MESMO
  // formulário de Delegar (não um form solto) — antes, essas ações criavam uma Task sem
  // responsável (órfã), diferente de "Delegar", que sempre atribui a alguém. Unificado num
  // fluxo só: default TAREFA quando aberto pelo botão "Delegar" puro.
  const [delegateType, setDelegateType] = useState("TAREFA");
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const { showUndo } = useUndoToast();

  function markRead() {
    // Mesmo efeito do desktop: desliza 3cm pra esquerda esmorecendo por 1.5s antes de sumir
    // de verdade, pra ficar evidente que a ação surtiu efeito. Marca TODOS os itens do grupo.
    setLeaving(true);
    setTimeout(() => {
      startTransition(async () => {
        await markPublicationsRead(groupIds);
        router.refresh();
        showUndo({
          message: hasMultiple ? `Publicação e mais ${group.items.length - 1} fonte(s) marcadas como lidas.` : "Publicação marcada como lida.",
          onUndo: async () => {
            await markPublicationsUnread(groupIds);
            router.refresh();
          },
        });
      });
    }, 1500);
  }

  return (
    <div
      className={`px-4 py-3 transition-all duration-[1500ms] ease-in-out ${
        leaving ? "opacity-0 -translate-x-[3cm] pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
          {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento"}
        </Badge>
        <Badge color="navy">{pub.source}</Badge>
        <Badge color="slate">{formatDate(pub.publishedAt)}</Badge>
        {/* Indicador de agrupamento: mesmo processo capturado por mais de uma fonte (DJEN,
            Datajud, e-mail do Jusbrasil...) — clicar no card já expande e mostra todas. */}
        {hasMultiple && (
          <Badge color="bordo" className="inline-flex items-center gap-1">
            <Layers size={11} /> +{group.items.length - 1} outra{group.items.length - 1 > 1 ? "s" : ""} fonte{group.items.length - 1 > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {pub.caseId && pub.caseTitle && (
        <Link href={`/m/processos/${pub.caseId}`} className="text-xs font-medium text-gold-700 dark:text-gold-400 block mb-1">
          {pub.caseTitle}
        </Link>
      )}
      {!pub.caseId && pub.clientId && pub.clientName && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Cliente compatível: {pub.clientName}</p>
      )}

      {/* Cartão recolhido por padrão — clicar no conteúdo expande INLINE (mesma posição, sem
          modal) e revela o histórico completo do grupo + as ações (marcar como lida, agenda,
          delegar etc). Evita uma lista longa de andamentos já vir toda aberta com botões. */}
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-start justify-between gap-2 text-left">
        <p className={`text-sm text-navy-800 dark:text-cream-50/85 flex-1 ${open ? "" : "line-clamp-2"}`}>{pub.content}</p>
        <ChevronDown
          size={16}
          className={`shrink-0 mt-0.5 text-navy-800/30 dark:text-cream-50/30 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {hasMultiple ? (
            <div className="space-y-2 mb-2">
              {group.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-navy-800/8 dark:border-white/10 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge color="navy">{item.source}</Badge>
                      <Badge color="slate">{formatDate(item.publishedAt)}</Badge>
                      {!item.read && <Badge color="gold">Não lida</Badge>}
                    </div>
                    <CopyButton
                      text={item.content}
                      label="Copiar conteúdo"
                      showLabel={false}
                      className="shrink-0 p-1 rounded-lg text-navy-800/40 dark:text-cream-50/40 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors"
                    />
                  </div>
                  <p className="text-sm text-navy-800 dark:text-cream-50/85 whitespace-pre-wrap">{item.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-end mb-1">
              <CopyButton
                text={pub.content}
                label="Copiar conteúdo"
                showLabel={false}
                className="shrink-0 p-1.5 rounded-lg text-navy-800/40 dark:text-cream-50/40 hover:bg-cream-100 dark:hover:bg-white/10 transition-colors"
              />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={pending || leaving}
              onClick={markRead}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-800/70 dark:text-cream-50/70 px-3 py-1.5 rounded-lg bg-cream-100 dark:bg-white/5 hover:bg-cream-200 dark:hover:bg-white/10 disabled:opacity-50"
            >
              <Check size={13} /> {pending || leaving ? "Marcando..." : "Marcar como lida"}
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
                processNumberRaw={pub.processNumberRaw}
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
                        setDelegateType(a.type);
                        setDelegateOpen(true);
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
                onClick={() => {
                  setDelegateType("TAREFA");
                  setDelegateOpen(true);
                }}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold-800 dark:text-gold-400 px-3 py-1.5 rounded-lg bg-gold-500/10 dark:bg-gold-400/15"
              >
                <UserPlus size={13} /> Delegar
              </button>
            )}
          </div>
        </div>
      )}

      {delegateOpen && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
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
                type: delegateType,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
