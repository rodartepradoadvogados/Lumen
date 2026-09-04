"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  markPublicationsRead,
  markPublicationsUnread,
  setPublicationTriageStatus,
} from "@/lib/actions/publications";
import { Badge, formatDate } from "@/components/ui";
import PeticionarButton from "@/components/PeticionarButton";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import DelegateTaskForm from "@/components/DelegateTaskForm";
import LinkPublicationMenu from "@/components/LinkPublicationMenu";
import CopyButton from "@/components/CopyButton";
import { useUndoToast } from "@/components/UndoToastProvider";
import { Check, Undo2, CalendarClock, Gavel, Stethoscope, CalendarPlus, ListTodo, X, ChevronDown, Layers, UserPlus } from "lucide-react";
import Link from "next/link";
import TabLink from "@/components/TabLink";
import clsx from "clsx";
import type { PublicationGroup } from "@/lib/publicationGrouping";

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

// Recebe o GRUPO inteiro (uma ou mais publicações do mesmo processo, ver
// lib/publicationGrouping.ts) — todas as ações (marcar como lida, badges de estado) usam o item
// "primary" (fonte de maior prioridade: DJEN > Datajud > e-mail do Jusbrasil > demais) como
// representante do card, mas "marcar como lida" afeta TODOS os itens do grupo, não só o
// principal. Ações que fazem sentido só para uma publicação específica (vincular a processo,
// delegar, mudar status de triagem) continuam operando sobre o "primary" — vincular/delegar as
// demais fontes do mesmo processo, se necessário, continua possível abrindo cada uma via o
// expandir "+N outras fontes".
export default function PublicationRow({ group, users = [] }: { group: PublicationGroup<Pub>; users?: { id: string; name: string }[] }) {
  const router = useRouter();
  const pub = group.primary;
  const groupIds = group.items.map((i) => i.id);
  const hasMultiple = group.items.length > 1;

  // Expansão é INLINE, na mesma posição do card — sem modal separado (padrão já usado no app
  // mobile para o conteúdo completo da publicação, ver MobilePublicationCard.tsx). Mostra sempre
  // TODOS os itens do grupo em ordem cronológica (mais recente primeiro), mesmo quando o grupo
  // tem um item só — evita ter dois jeitos diferentes de olhar o conteúdo completo (expandido com
  // 1 item vs. expandido com vários).
  const [expanded, setExpanded] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  // "Gerar Prazo"/"Marcar Audiência"/etc. no menu Agenda pré-selecionam o tipo e abrem o MESMO
  // formulário de Delegar (não um form solto) — antes, essas ações criavam uma Task sem
  // responsável (órfã), diferente de "Delegar", que sempre atribui a alguém. Unificado num
  // fluxo só: default TAREFA quando aberto pelo botão "Delegar" puro.
  const [delegateType, setDelegateType] = useState("TAREFA");
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
    // Desliza 3cm pra esquerda enquanto esmorece (1.5s) antes de sumir de verdade — sem isso,
    // o router.refresh() troca a lista instantaneamente e não dá pra perceber que a ação surtiu
    // efeito. O toast de desfazer só aparece depois da animação, quando o item já saiu da tela.
    // Marca TODOS os itens do grupo como lidos (não só o principal exibido) — elimina a
    // duplicidade também na contagem de não lidas, não só na tela.
    setLoading(true);
    setLeaving(true);
    setTimeout(() => {
      markPublicationsRead(groupIds).then(() => {
        router.refresh();
        setLoading(false);
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

  function markUnread() {
    setLoading(true);
    markPublicationsUnread(groupIds).then(() => {
      router.refresh();
      setLoading(false);
    });
  }

  function pickAction(type: string) {
    setAgendaOpen(false);
    setDelegateType(type);
    setDelegateOpen(true);
  }

  function handleTriage(status: string) {
    setLoading(true);
    setPublicationTriageStatus(pub.id, status).then(() => {
      router.refresh();
      setLoading(false);
    });
  }

  return (
    <div
      className={clsx(
        "px-5 py-4 relative transition-all duration-[1500ms] ease-in-out",
        leaving && "opacity-0 -translate-x-[3cm] pointer-events-none"
      )}
    >
      {pub.case && !!pub.taskCount && (
        <Link
          href={`/processos/${pub.case.id}?tab=atividades`}
          onClick={(e) => e.stopPropagation()}
          data-tip="Ver atividades vinculadas a esta publicação"
          className="absolute right-7 top-4 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-atencao text-white text-[10px] font-bold tabular-nums z-10"
        >
          {pub.taskCount}
        </Link>
      )}
      <button onClick={() => setExpanded((o) => !o)} className="block w-full text-left relative pr-7">
        <ChevronDown
          size={16}
          className={clsx("absolute right-0 top-0.5 text-tx-3 transition-transform", expanded && "rotate-180")}
        />
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
            {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento Processual"}
          </Badge>
          <Badge color="navy">{pub.source}</Badge>
          <Badge color="slate">{formatDate(pub.publishedAt)}</Badge>
          {pub.lawyerTag && <Badge color="gold">{pub.lawyerTag}</Badge>}
          {!group.allRead && <Badge color="gold">Não lida</Badge>}
          {group.items.some((i) => i.deadlineGenerated) && <Badge color="green">Compromisso gerado</Badge>}
          <Badge color={triageColors[pub.triageStatus] || "amber"}>{triageLabels[pub.triageStatus] || pub.triageStatus}</Badge>
          {/* Indicador de agrupamento: mesmo processo capturado por mais de uma fonte (DJEN,
              Datajud, e-mail do Jusbrasil...). Clicar no card já expande — este badge só avisa
              que existe mais coisa lá dentro, sem poluir o layout com outro controle. */}
          {hasMultiple && (
            <Badge color="bordo" className="inline-flex items-center gap-1">
              <Layers size={11} /> +{group.items.length - 1} outra{group.items.length - 1 > 1 ? "s" : ""} fonte{group.items.length - 1 > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {pub.case && <p className="text-xs font-medium text-marca-tx">{pub.case.title}</p>}
        {!pub.case && pub.client && <p className="text-xs font-medium text-concluido">Cliente compatível: {pub.client.name}</p>}
        {!expanded && <p className="text-sm text-tx mt-1 line-clamp-2">{pub.content}</p>}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {pub.case?.processNumber && <ProcessNumberChip processNumber={pub.case.processNumber} />}
          {group.items.map((item) => (
            <div key={item.id} className="border-t-2 border-regua-forte p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge color="navy">{item.source}</Badge>
                  <Badge color="slate">{formatDate(item.publishedAt)}</Badge>
                  <Badge color={item.kind === "PUBLICACAO" ? "blue" : "gold"}>
                    {item.kind === "PUBLICACAO" ? "Publicação" : "Andamento Processual"}
                  </Badge>
                  {!item.read && <Badge color="gold">Não lida</Badge>}
                </div>
                <CopyButton
                  text={item.content}
                  label="Copiar conteúdo"
                  showLabel={false}
                  className="shrink-0 p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors rounded-md"
                />
              </div>
              <p className="text-sm text-tx whitespace-pre-wrap">{item.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {!group.allRead ? (
          <button
            onClick={markRead}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 bg-sf-apoio hover:bg-regua"
          >
            <Check size={12} /> Marcar como lida
          </button>
        ) : (
          <button
            onClick={markUnread}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 bg-sf-apoio hover:bg-regua"
          >
            <Undo2 size={12} /> Marcar como não lida
          </button>
        )}

        {pub.case && (
          <TabLink
            href={`/processos/${pub.case.id}`}
            label={pub.case.title}
            className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 bg-sf-apoio hover:bg-regua"
          >
            Abrir Processo
          </TabLink>
        )}
        {!pub.case && pub.client && (
          <Link href={`/contatos/clientes#client-${pub.client.id}`} className="flex items-center gap-1 text-[11px] font-semibold text-concluido hover:opacity-80 px-2.5 py-1 bg-concluido-bg rounded-sm">
            Abrir Cadastro do Cliente
          </Link>
        )}
        {!pub.case && (
          <LinkPublicationMenu
            publicationId={pub.id}
            // publicationId na query: quando o processo nascer, createCase vincula automaticamente
            // esta publicação a ele (ver linkOriginPublicationBestEffort em lib/actions/cases.ts) —
            // sem isso o usuário teria que voltar aqui e vincular à mão.
            newCaseHref={`/processos/novo?type=JUDICIAL&publicationId=${encodeURIComponent(pub.id)}${pub.processNumberRaw ? `&processNumber=${encodeURIComponent(pub.processNumberRaw)}` : ""}`}
            processNumberRaw={pub.processNumberRaw}
          />
        )}

        <CopyButton text={pub.content} label="Copiar conteúdo" />

        <PeticionarButton compact caseId={pub.case?.id} />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setAgendaOpen((o) => !o)}
            className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 bg-sf-apoio hover:bg-regua"
          >
            <CalendarClock size={12} /> Agenda <ChevronDown size={11} />
          </button>
          {agendaOpen && (
            <div className="absolute left-0 top-full mt-1 w-48 bg-sf border border-regua shadow-menu z-20 overflow-hidden origin-top-left animate-popup-in">
              {actionButtons.map((a) => (
                <button
                  key={a.type}
                  onClick={() => pickAction(a.type)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-tx hover:bg-sf-apoio transition-colors"
                >
                  <a.icon size={13} /> {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {assignedToName && (
          <span data-tip="Responsável pela triagem" className="text-[11px] font-medium text-tx-2 px-2 py-1 bg-sf-apoio">
            Responsável: {assignedToName}
          </span>
        )}
        {users.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setDelegateType("TAREFA");
              setDelegateOpen(true);
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx px-2.5 py-1 bg-sf-apoio hover:bg-regua"
          >
            <UserPlus size={12} /> Delegar
          </button>
        )}

        <select
          value={pub.triageStatus}
          disabled={loading}
          onChange={(e) => handleTriage(e.target.value)}
          data-tip="Status da triagem"
          className="text-[11px] font-semibold text-tx-2 px-2 py-1 bg-sf-apoio border border-regua cursor-pointer disabled:opacity-50"
        >
          <option value="PENDENTE">Pendente</option>
          <option value="EM_ANALISE">Em análise</option>
          <option value="TRATADA">Tratada</option>
        </select>
      </div>

      {delegateOpen && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf shadow-modal w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-thin" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-bold text-tx">Delegar publicação</h3>
              <button onClick={() => setDelegateOpen(false)} className="text-tx-3 hover:text-tx">
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
                type: delegateType,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
