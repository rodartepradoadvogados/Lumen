"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  markPublicationsRead,
  setPublicationTriageStatus,
  searchCasesForLinking,
  linkPublicationToCase,
  blockProcessNumber,
} from "@/lib/actions/publications";
import DelegateTaskForm, { type DelegateTaskInitial } from "@/components/DelegateTaskForm";
import ModalShell from "@/components/ModalShell";
import CopyButton from "@/components/CopyButton";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import PeticionarButton from "@/components/PeticionarButton";
import { formatDate, formatCalendarDate } from "@/components/ui";
import { CalendarClock, FilePlus2, UserPlus, Archive, Search, Layers, Ban, CheckCheck } from "lucide-react";
import type { PublicationGroup } from "@/lib/publicationGrouping";
import { matchesPublicationChip, type PublicationChipKey } from "@/lib/publicationChips";

export type TriagePub = {
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

export type TriageGroup = PublicationGroup<TriagePub> & { prazoSugeridoDate: string; prazoSugeridoDiasUteis: number };

// Mesma tabela de cores por fonte do manual (DESIGN-SYSTEM.md §9) já usada em
// components/PublicationsList.tsx — chaves batem com Publication.source de verdade.
const SOURCE_BORDER_COLORS: Record<string, string> = {
  DJE: "border-l-acao",
  PJE: "border-l-fonte-pje",
  ESAJ: "border-l-aviso",
  PROJUDI: "border-l-tx-2",
  MANUAL: "border-l-atencao",
  JUSBRASIL_EMAIL: "border-l-concluido",
};
const DEFAULT_SOURCE_BORDER_COLOR = "border-l-regua-forte";
function sourceBorderColor(source: string): string {
  return SOURCE_BORDER_COLORS[source] ?? DEFAULT_SOURCE_BORDER_COLOR;
}

type CaseHit = { id: string; title: string; processNumber: string | null };

// Triagem com teclado de /publicacoes (documento 05 do handoff do redesenho): duas colunas —
// fila (esquerda) e teor da publicação selecionada (direita) — sem sair da rota. `groups` já vem
// filtrado pelo chip ativo do lado do servidor (mesmo padrão das antigas abas Não lidas/Lidas/
// Todos); este componente mantém uma CÓPIA local (`items`) que ele mesmo atualiza de forma
// otimista a cada ação (arquivar/vincular/criar tarefa/delegar), recalculando quais grupos ainda
// pertencem ao chip ativo — sem isso, cada ação exigiria esperar um router.refresh() completo
// (nova query + novo agrupamento) antes de a fila reagir, o que inviabilizaria triar cinquenta
// publicações em sequência rápida pelo teclado.
export default function PublicationsTriage({
  groups,
  users,
  activeChip,
  viewerId,
}: {
  groups: TriageGroup[];
  users: { id: string; name: string }[];
  activeChip: PublicationChipKey;
  viewerId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(groups);
  useEffect(() => setItems(groups), [groups]);

  const visible = useMemo(
    () => items.filter((g) => matchesPublicationChip(g, activeChip, viewerId)),
    [items, activeChip, viewerId]
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(visible[0]?.key ?? null);
  useEffect(() => {
    if (!visible.some((g) => g.key === selectedKey)) setSelectedKey(visible[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((g) => g.key).join(",")]);
  const selected = visible.find((g) => g.key === selectedKey) ?? null;

  const [busy, setBusy] = useState(false);
  const [taskModal, setTaskModal] = useState<{ open: boolean; groupKey: string | null; type: string }>({
    open: false,
    groupKey: null,
    type: "PRAZO",
  });
  const [linkModal, setLinkModal] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function pickNextKey(currentKey: string): string | null {
    const idx = visible.findIndex((g) => g.key === currentKey);
    if (idx === -1) return visible[0]?.key ?? null;
    return visible[idx + 1]?.key ?? visible[idx - 1]?.key ?? null;
  }

  function moveSelection(dir: 1 | -1) {
    if (!selected) return;
    const idx = visible.findIndex((g) => g.key === selected.key);
    const next = visible[idx + dir];
    if (next) setSelectedKey(next.key);
  }

  // Atualiza o grupo localmente (sem esperar o servidor) e, se ele deixou de bater com o chip
  // ativo, já avança a seleção para o próximo item visível — usado depois de toda ação que muda
  // um dado que decide inclusão no chip (triageStatus, leitura, responsável, processo vinculado).
  // `markRead` também marca todos os itens do grupo como lidos (allRead) — usado depois de
  // arquivar/gerar tarefa, nunca depois de só vincular a processo (que não resolve a pendência).
  function patchGroup(key: string, primaryPatch: Partial<TriagePub>, markRead = false) {
    const nextKey = pickNextKey(key);
    setItems((prev) =>
      prev.map((g) =>
        g.key === key
          ? {
              ...g,
              primary: { ...g.primary, ...primaryPatch },
              allRead: markRead ? true : g.allRead,
              items: markRead ? g.items.map((i) => ({ ...i, read: true })) : g.items,
            }
          : g
      )
    );
    setSelectedKey(nextKey);
  }

  async function archive() {
    if (!selected || busy) return;
    const group = selected;
    setBusy(true);
    patchGroup(group.key, { triageStatus: "TRATADA" }, true);
    try {
      await Promise.all([
        setPublicationTriageStatus(group.primary.id, "TRATADA"),
        markPublicationsRead(group.items.map((i) => i.id)),
      ]);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  // Marca como lida SEM arquivar — diferente de archive() acima, não mexe em triageStatus. Some
  // do chip "Não triadas" (que filtra só por leitura, ver lib/publicationChips.ts) só para ESTE
  // usuário: leitura é por usuário (PublicationRead, unique por publicationId+userId), então o
  // mesmo item continua aparecendo como não triado para os colegas do escritório.
  async function marcarLida() {
    if (!selected || busy) return;
    const group = selected;
    setBusy(true);
    patchGroup(group.key, {}, true);
    try {
      await markPublicationsRead(group.items.map((i) => i.id));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function openTask(type: string) {
    if (!selected || busy) return;
    setTaskModal({ open: true, groupKey: selected.key, type });
  }

  function openLink() {
    if (!selected || selected.primary.case || busy) return;
    setLinkModal(true);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (taskModal.open || linkModal) return; // Esc dos modais é tratado pelo próprio ModalShell
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!selected) return;
      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
      } else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        openTask("PRAZO");
      } else if ((e.key === "v" || e.key === "V") && !selected.primary.case) {
        e.preventDefault();
        openLink();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        archive();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        marcarLida();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, taskModal.open, linkModal, visible]);

  const taskGroup = items.find((g) => g.key === taskModal.groupKey) ?? null;
  const taskInitial: DelegateTaskInitial | undefined = taskGroup
    ? {
        publicationId: taskGroup.primary.id,
        type: taskModal.type,
        title: taskGroup.primary.content.slice(0, 50),
        referTo: taskGroup.primary.case ? "PROCESSO" : "OUTROS",
        selectedLink: taskGroup.primary.case ? { id: taskGroup.primary.case.id, label: taskGroup.primary.case.title } : undefined,
        responsibleIds: taskGroup.primary.assignedToId ? [taskGroup.primary.assignedToId] : undefined,
        dueDate: taskModal.type === "PRAZO" ? taskGroup.prazoSugeridoDate : undefined,
      }
    : undefined;

  function handleTaskSuccess(responsibleIds: string[]) {
    if (!taskModal.groupKey) return;
    patchGroup(taskModal.groupKey, { assignedToId: responsibleIds[0] ?? null, deadlineGenerated: true }, true);
  }

  return (
    <div className="flex flex-1 min-h-0 w-full">
      <div ref={listRef} className="w-[560px] shrink-0 border-r-2 border-regua-forte overflow-y-auto scrollbar-thin">
        {visible.length === 0 ? (
          <p className="p-6 text-sm text-tx-2">Nada por aqui.</p>
        ) : (
          <div className="divide-y divide-regua">
            {visible.map((g) => (
              <FilaCard key={g.key} group={g} selected={g.key === selectedKey} onSelect={() => setSelectedKey(g.key)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-thin">
        {selected ? (
          <Teor
            group={selected}
            users={users}
            busy={busy}
            onCriarTarefa={() => openTask("PRAZO")}
            onVincular={openLink}
            onDelegar={() => openTask("TAREFA")}
            onArquivar={archive}
            onMarcarLida={marcarLida}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-tx-3">Selecione uma publicação na fila.</div>
        )}
      </div>

      {taskModal.open && taskGroup && taskInitial && (
        <ModalShell
          size="medio"
          title={taskModal.type === "PRAZO" ? "Criar tarefa com prazo" : "Delegar publicação"}
          onClose={() => {
            setTaskModal({ open: false, groupKey: null, type: "PRAZO" });
            router.refresh();
          }}
        >
          <div className="overflow-y-auto scrollbar-thin flex-1">
            <DelegateTaskForm users={users} initial={taskInitial} onSuccess={handleTaskSuccess} />
          </div>
        </ModalShell>
      )}

      {linkModal && selected && (
        <LinkModal
          group={selected}
          onClose={() => setLinkModal(false)}
          onLinked={(hit) => {
            if (!selected) return;
            patchGroup(selected.key, { case: { id: hit.id, title: hit.title, processNumber: hit.processNumber } });
            setLinkModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FilaCard({ group, selected, onSelect }: { group: TriageGroup; selected: boolean; onSelect: () => void }) {
  const pub = group.primary;
  const hasMultiple = group.items.length > 1;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "block w-full text-left px-4 py-3 border-l-4 transition-colors",
        sourceBorderColor(pub.source),
        selected ? "bg-sf-apoio" : "bg-sf hover:bg-sf-apoio/60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx-2 truncate">
          {pub.source}
          {hasMultiple && (
            <span className="inline-flex items-center gap-0.5 ml-1.5 text-bordo">
              <Layers size={10} /> +{group.items.length - 1}
            </span>
          )}
          {!group.allRead && <span className="ml-1.5 text-marca-tx">· não triada</span>}
        </span>
        <span className="text-[11px] text-tx-3 shrink-0 tabular-nums">{formatDate(pub.publishedAt)}</span>
      </div>
      <p className="text-sm text-tx mt-1 line-clamp-2">{pub.content}</p>
      {pub.case ? (
        <p className="text-[13px] font-extrabold text-tx mt-1 truncate">{pub.case.title}</p>
      ) : (
        <span className="inline-block mt-1.5 text-[11px] font-semibold text-aviso bg-aviso-bg px-2 py-0.5">
          sem processo vinculado
        </span>
      )}
    </button>
  );
}

function Teor({
  group,
  users,
  busy,
  onCriarTarefa,
  onVincular,
  onDelegar,
  onArquivar,
  onMarcarLida,
}: {
  group: TriageGroup;
  users: { id: string; name: string }[];
  busy: boolean;
  onCriarTarefa: () => void;
  onVincular: () => void;
  onDelegar: () => void;
  onArquivar: () => void;
  onMarcarLida: () => void;
}) {
  const pub = group.primary;
  const assignedToName = users.find((u) => u.id === pub.assignedToId)?.name;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-5 pb-4 border-b border-regua shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx-2">
          {pub.source} · {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento"} · {formatDate(pub.publishedAt)}
          {assignedToName && <> · responsável: {assignedToName}</>}
        </p>
        <h2 className="text-2xl font-extrabold text-tx mt-1">
          {pub.case ? (
            <Link href={`/processos/${pub.case.id}`} className="hover:text-acao transition-colors">
              {pub.case.title}
            </Link>
          ) : pub.client ? (
            `Cliente compatível: ${pub.client.name}`
          ) : (
            "Sem processo vinculado"
          )}
        </h2>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {pub.case?.processNumber && <ProcessNumberChip processNumber={pub.case.processNumber} />}
          <span className="text-xs font-semibold text-tx-2">
            Prazo sugerido ({group.prazoSugeridoDiasUteis} dias úteis) → <span className="text-tx">{formatCalendarDate(group.prazoSugeridoDate)}</span>
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        <div className="max-w-[80ch] space-y-4">
          {group.items.map((item) => (
            <div key={item.id} className={group.items.length > 1 ? "border-t-2 border-regua-forte pt-4 first:border-t-0 first:pt-0" : ""}>
              {group.items.length > 1 && (
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx-2 mb-1.5">
                  {item.source} · {formatDate(item.publishedAt)}
                </p>
              )}
              <p className="text-[15px] leading-[1.6] text-tx whitespace-pre-wrap">{item.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t-2 border-regua-forte px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={onCriarTarefa}
            className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2"
          >
            <CalendarClock size={15} /> Criar tarefa com prazo
          </button>
          {!pub.case && (
            <button
              type="button"
              disabled={busy}
              onClick={onVincular}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2 disabled:opacity-50"
            >
              <FilePlus2 size={15} /> Vincular a processo
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onDelegar}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2 disabled:opacity-50"
          >
            <UserPlus size={15} /> Delegar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onArquivar}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2 disabled:opacity-50"
          >
            <Archive size={15} /> Arquivar
          </button>
          <button
            type="button"
            disabled={busy || group.allRead}
            onClick={onMarcarLida}
            title="Some da fila Não triadas só para você — os outros colegas do escritório continuam vendo"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2 disabled:opacity-50"
          >
            <CheckCheck size={15} /> {group.allRead ? "Lida" : "Marcar como lida"}
          </button>
          <CopyButton text={pub.content} label="Copiar conteúdo" />
          <PeticionarButton compact caseId={pub.case?.id} />
        </div>
        <span className="text-[13px] text-tx-3 whitespace-nowrap">J / K navega · Enter cria tarefa · A arquiva · L marca como lida</span>
      </div>
    </div>
  );
}

// Modal de "Vincular a processo" (tecla V ou botão) — busca processo já cadastrado; se não
// houver processo, "Cadastrar novo processo" segue pra tela de Novo Processo já pré-preenchida
// (mesma query publicationId/processNumber de antes, ver components/LinkPublicationMenu.tsx).
// "Bloquear" (só quando há número de processo identificado) mora aqui dentro em vez de virar uma
// 5ª ação na barra do teor — documento 05 define só 4 ações na barra; bloquear é um desfecho raro
// dentro do MESMO fluxo de "isto não tem processo", igual já era em LinkPublicationMenu.
function LinkModal({ group, onClose, onLinked }: { group: TriageGroup; onClose: () => void; onLinked: (hit: CaseHit) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaseHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      const res = await searchCasesForLinking(q);
      if (id !== reqId.current) return;
      setResults(res);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(hit: CaseHit) {
    setLinking(true);
    await linkPublicationToCase(group.primary.id, hit.id);
    setLinking(false);
    onLinked(hit);
  }

  async function confirmBlock() {
    setBlocking(true);
    await blockProcessNumber(group.primary.id);
    setBlocking(false);
    setBlockConfirm(false);
    onClose();
    router.refresh();
  }

  const newCaseHref = `/processos/novo?type=JUDICIAL&publicationId=${encodeURIComponent(group.primary.id)}${
    group.primary.processNumberRaw ? `&processNumber=${encodeURIComponent(group.primary.processNumberRaw)}` : ""
  }`;

  return (
    <ModalShell size="compacto" title="Vincular a processo" onClose={onClose}>
      <div className="p-4 space-y-2 overflow-y-auto flex-1">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou número do processo..."
            className="w-full border border-regua bg-sf text-tx pl-8 pr-3 py-2 text-sm"
          />
        </div>
        {searching && <p className="text-xs text-tx-2 px-1">Buscando...</p>}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-xs text-tx-2 px-1">Nenhum processo encontrado.</p>
        )}
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={linking}
            onClick={() => pick(c)}
            className="flex flex-col items-start w-full px-3 py-2 text-left hover:bg-sf-apoio transition-colors disabled:opacity-50"
          >
            <span className="text-sm text-tx">{c.title}</span>
            {c.processNumber && <span className="text-xs text-tx-2 tabular-nums">{c.processNumber}</span>}
          </button>
        ))}

        <div className="pt-2 border-t border-regua mt-2 space-y-1.5">
          <Link href={newCaseHref} className="flex items-center gap-2 text-xs font-semibold text-acao hover:text-acao-hover px-1 py-1.5">
            <FilePlus2 size={13} /> Cadastrar novo processo
          </Link>
          {group.primary.processNumberRaw && (
            <button
              type="button"
              onClick={() => setBlockConfirm(true)}
              className="flex items-center gap-2 text-xs font-semibold text-atencao hover:opacity-80 px-1 py-1.5"
            >
              <Ban size={13} /> Bloquear (parar de receber este processo)
            </button>
          )}
        </div>
      </div>

      {blockConfirm && (
        <ModalShell size="compacto" title="Bloquear processo" onClose={() => setBlockConfirm(false)}>
          <div className="p-5 space-y-4">
            <p className="text-sm text-tx">
              Esta ação faz com que você deixe de receber publicações e andamentos processuais deste processo — os demais advogados
              do escritório continuam recebendo normalmente. Tem certeza?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={blocking}
                onClick={() => setBlockConfirm(false)}
                className="px-4 py-2 text-sm font-semibold text-tx-2 hover:bg-sf-apoio disabled:opacity-50"
              >
                Não
              </button>
              <button
                type="button"
                disabled={blocking}
                onClick={confirmBlock}
                className="px-4 py-2 text-sm font-semibold bg-atencao hover:opacity-90 text-white disabled:opacity-50"
              >
                {blocking ? "Bloqueando..." : "Sim"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </ModalShell>
  );
}
