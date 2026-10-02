"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TabLink from "@/components/TabLink";
import clsx from "clsx";
import {
  markPublicationsRead,
  markPublicationsUnread,
  markPublicationsReadBatch,
  setPublicationTriageStatus,
  assignPublicationsBatch,
  restorePublicationSnapshots,
  undoPublicationDeadlines,
  getPublicationSnapshots,
  searchCasesForLinking,
  linkPublicationToCase,
  blockProcessNumber,
  unblockProcessNumber,
  type PublicationSnapshot,
} from "@/lib/actions/publications";
import { delegateTask } from "@/lib/actions/tasks";
import DelegateTaskForm, { type DelegateTaskInitial } from "@/components/DelegateTaskForm";
import ModalShell from "@/components/ModalShell";
import PainelDividido from "@/components/PainelDividido";
import { useUndoToast } from "@/components/UndoToastProvider";
import CopyButton from "@/components/CopyButton";
import ProcessNumberChip from "@/components/ProcessNumberChip";
import PeticionarButton from "@/components/PeticionarButton";
import { formatCalendarDate } from "@/components/ui";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";
import {
  CalendarClock,
  FilePlus2,
  UserPlus,
  Archive,
  Search,
  Ban,
  Eye,
  TriangleAlert,
  Clock,
  CircleHelp,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Users,
} from "lucide-react";
import type { PublicationGroup } from "@/lib/publicationGrouping";
import { matchesPublicationChip, type PublicationChipKey } from "@/lib/publicationChips";
import type { FaixaPrazo, PrazoExtraido, SituacaoPrazo } from "@/lib/prazoExtraido";
import { rotuloPrazo, CONFIANCA_TXT, type TomPrazo } from "@/lib/prazoRotulo";

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
  tribunalDetectado: string | null;
  case: { id: string; title: string; processNumber: string | null } | null;
  client: { id: string; name: string } | null;
  taskCount?: number;
  assignedToId: string | null;
  triageStatus: string;
};

export type TriageGroup = PublicationGroup<TriagePub> & {
  // O que o TEXTO diz sobre prazo (lib/prazoExtraido.ts) — sugestão, nunca valor de campo.
  prazo: PrazoExtraido;
  situacao: SituacaoPrazo;
  // Idade da publicação em dias úteis: fato, independe da extração.
  idadeDu: number;
  // Já existe tarefa/prazo criado a partir desta publicação.
  registrado: boolean;
};

type UserLite = { id: string; name: string };
type CaseHit = { id: string; title: string; processNumber: string | null };
export type CargaPorPessoa = Record<string, { abertas: number; vencidas: number }>;

const DESFECHO_MS = 780; // desfecho legível (texto de alto contraste, sem flash de cor)
const COLAPSO_MS = 220; // colapso da altura, sem buraco — soma 1000ms, pedido explícito do dono
const UNDO_MS = 10000;
// Idade (dias úteis desde a publicação) a partir da qual a tela destaca a data: fato, não estimativa.
const IDADE_DESTAQUE_DU = 10;

const BANDAS: { k: FaixaPrazo | "reg"; titulo: string; tom: "venc" | "hoje" | "neutro" }[] = [
  { k: "venc", titulo: "Vencidos", tom: "venc" },
  { k: "hoje", titulo: "Vencem hoje", tom: "hoje" },
  { k: "d3", titulo: "Até 3 dias úteis", tom: "hoje" },
  { k: "d15", titulo: "Até 15 dias úteis", tom: "neutro" },
  { k: "dep", titulo: "Depois de 15 dias úteis", tom: "neutro" },
  { k: "sem", titulo: "Prazo não identificado, confirme", tom: "neutro" },
  { k: "cien", titulo: "Só ciência", tom: "neutro" },
  { k: "reg", titulo: "Com prazo registrado", tom: "neutro" },
];

function bandaDe(g: TriageGroup): FaixaPrazo | "reg" {
  return g.registrado ? "reg" : g.situacao.faixa;
}

const TOM_TEXTO: Record<TomPrazo, string> = {
  venc: "text-risco-vencido-tx",
  hoje: "text-risco-hoje-tx",
  neutro: "text-tx-2",
  ok: "text-risco-em-dia-tx",
};
const TOM_BLOCO: Record<TomPrazo, string> = {
  venc: "bg-campo-risco border-campo-risco-linha",
  hoje: "bg-aviso-bg border-linha-aviso",
  neutro: "bg-sf border-regua",
  ok: "bg-sf border-regua",
};

// Cita prazo (ou fala em prazo sem número, ou traz números divergentes) e ainda não há prazo criado.
function citaPrazo(g: TriageGroup): boolean {
  return g.prazo.tipo !== "NENHUM" || Boolean(g.prazo.mencionaPrazo);
}
function citaPrazoSemRegistro(g: TriageGroup): boolean {
  return !g.registrado && (g.prazo.tipo === "PRAZO" || g.prazo.tipo === "CONFLITO" || Boolean(g.prazo.mencionaPrazo));
}

function basisDoPrazo(p: PrazoExtraido): string {
  const base = p.base ? p.base.split("-").reverse().join("/") : "";
  const tipo = p.corridos ? "corridos" : "úteis";
  return `Contado a partir de ${base}, ${p.dias} dias ${tipo} (o texto diz "${p.trecho}").`;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
function dm(chave: string): string {
  const [, m, d] = chave.split("-");
  return `${d}/${m}`;
}
function duTxt(n: number): string {
  return `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
}

function partesDe(g: TriageGroup): string {
  const p = g.primary;
  if (p.case) return p.case.title;
  if (p.client) return `Cliente compatível: ${p.client.name}`;
  return p.processNumberRaw ? `Sem processo vinculado · ${p.processNumberRaw}` : "Sem processo vinculado";
}

// Ato: o teor sem o "Processo <número>." do começo — a primeira frase que diz o que aconteceu.
function atoDe(content: string): string {
  return content.replace(/^\s*Processo\s+[\d.\-/]+\.?\s*/i, "").trim();
}

function rotuloDaLinha(g: TriageGroup, nome: (id: string | null) => string): string {
  const r = rotuloPrazo({ prazo: g.prazo, situacao: g.situacao, registrado: g.registrado, tratada: g.primary.triageStatus === "TRATADA" });
  return `${partesDe(g)}. ${atoDe(g.primary.content).slice(0, 80)}. ${r.texto}${r.detalhe ? `, ${r.detalhe}` : ""}. Responsável: ${nome(g.primary.assignedToId)}.${g.allRead ? "" : " Nova."}${g.primary.case ? "" : " Sem processo vinculado."}`;
}

function PrazoCelula({ g, compacto = false }: { g: TriageGroup; compacto?: boolean }) {
  const cheio = rotuloPrazo({ prazo: g.prazo, situacao: g.situacao, registrado: g.registrado, tratada: g.primary.triageStatus === "TRATADA" });
  // Na linha da fila o texto é curto ("VENCIDO há 5 du"), para as partes caberem; o nome acessível
  // da linha e o painel trazem a frase inteira.
  const r = compacto
    ? {
        ...cheio,
        texto: cheio.texto.replace(/dias úteis|dia útil/, "du"),
        detalhe: cheio.detalhe?.replace("prazo ", "").replace(/\/\d{4}/, ""),
      }
    : cheio;
  const Icone = r.tom === "venc" ? TriangleAlert : r.tom === "hoje" ? Clock : r.tom === "ok" ? CircleCheck : g.situacao.faixa === "sem" ? CircleHelp : CalendarClock;
  return (
    <span title={compacto ? `${cheio.texto}${cheio.detalhe ? `, ${cheio.detalhe}` : ""}` : undefined} className={clsx("inline-flex items-center gap-1 text-etiqueta font-bold shrink-0", TOM_TEXTO[r.tom])}>
      <Icone size={14} aria-hidden="true" />
      <span>
        {r.texto}
        {r.detalhe && <span className="font-medium"> · {r.detalhe}</span>}
      </span>
    </span>
  );
}

type Dialogo =
  | { tipo: "prazoLote"; keys: string[] }
  | { tipo: "atribuir"; keys: string[] }
  | { tipo: "vistasRecorte" }
  | { tipo: "atalhos" }
  | null;

// Triagem de /publicacoes: fila por urgência (esquerda) e leitura da publicação (direita), sem sair
// da rota. `groups` já vem filtrado, ordenado e cortado do servidor; este componente mantém uma
// CÓPIA local (`items`) atualizada de forma otimista a cada ação — sem isso, cada ação exigiria
// esperar um router.refresh() completo antes de a fila reagir, e triar cinquenta publicações em
// sequência pelo teclado ficaria inviável.
export default function PublicationsTriage({
  groups,
  users,
  activeChip,
  viewerId,
  initialKey,
  carga,
  totalAbertas,
  agrupar,
}: {
  groups: TriageGroup[];
  users: UserLite[];
  activeChip: PublicationChipKey;
  viewerId: string;
  initialKey?: string;
  carga: CargaPorPessoa;
  totalAbertas: number;
  // Fila em faixas de urgência (padrão) ou lista corrida ("mais recentes", "tratadas").
  agrupar: boolean;
}) {
  const router = useRouter();
  const { showUndo, undoLast } = useUndoToast();
  const [items, setItems] = useState(groups);

  const visible = useMemo(() => items.filter((g) => matchesPublicationChip(g, activeChip, viewerId)), [items, activeChip, viewerId]);

  const [selectedKey, setSelectedKey] = useState<string | null>(
    (initialKey && visible.some((g) => g.key === initialKey) ? initialKey : visible[0]?.key) ?? null
  );
  useEffect(() => {
    if (!visible.some((g) => g.key === selectedKey)) setSelectedKey(visible[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((g) => g.key).join(",")]);
  const selected = visible.find((g) => g.key === selectedKey) ?? null;

  const [dismissing, setDismissing] = useState<Record<string, string>>({});
  const navegaveis = useMemo(() => visible.filter((g) => !dismissing[g.key]), [visible, dismissing]);
  const [marc, setMarc] = useState<Set<string>>(new Set());
  const ancoraRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [detalhe, setDetalhe] = useState(false);
  const [maisMobile, setMaisMobile] = useState(false);
  const [maisFila, setMaisFila] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [live, setLive] = useState("");
  const [taskModal, setTaskModal] = useState<{ groupKey: string; type: string; before: PublicationSnapshot[] } | null>(null);
  const [linkModal, setLinkModal] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const primeiraRender = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const nomeDe = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? "outra pessoa" : "sem responsável");
  const curtoDe = (id: string | null) => (id ? primeiroNome(nomeDe(id)) : "sem responsável");
  const reduzido = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Região viva: anuncia o tamanho da fila quando ela muda por ação ou filtro (não na 1ª pintura).
  useEffect(() => {
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    const venc = navegaveis.filter((g) => !g.registrado && g.situacao.faixa === "venc").length;
    const t = window.setTimeout(
      () =>
        setLive(
          navegaveis.length
            ? `${navegaveis.length} de ${totalAbertas} publicações na fila${venc ? `, ${venc} vencidas` : ""}.`
            : "Nenhuma publicação na fila."
        ),
      300
    );
    return () => window.clearTimeout(t);
  }, [navegaveis.length, totalAbertas]); // eslint-disable-line react-hooks/exhaustive-deps

  // A publicação aberta vai para a URL (?p=<id>) e a linha correspondente rola até ficar visível.
  useEffect(() => {
    if (!selectedKey) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("p") !== selectedKey) {
        url.searchParams.set("p", selectedKey);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      /* sem history/URL: só perde o link por publicação */
    }
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  function focarLinha(key: string | null, mesmoNoCelular = false) {
    if (!key || (narrow && !mesmoNoCelular)) return;
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-main="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }));
  }

  function proximaChave(atual: string): string | null {
    const i = navegaveis.findIndex((g) => g.key === atual);
    if (i === -1) return navegaveis[0]?.key ?? null;
    return navegaveis[i + 1]?.key ?? navegaveis[i - 1]?.key ?? null;
  }

  function mover(dir: 1 | -1) {
    if (!navegaveis.length) return;
    const i = navegaveis.findIndex((g) => g.key === selectedKey);
    const alvo = navegaveis[Math.min(navegaveis.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
    if (alvo) {
      setSelectedKey(alvo.key);
      focarLinha(alvo.key);
    }
  }

  function patchGrupo(key: string, patch: Partial<TriagePub>, marcarLidas: boolean) {
    setItems((prev) =>
      prev.map((g) =>
        g.key === key
          ? {
              ...g,
              primary: { ...g.primary, ...patch },
              registrado: patch.deadlineGenerated ? true : g.registrado,
              allRead: marcarLidas ? true : g.allRead,
              items: g.items.map((i) => ({ ...i, ...(marcarLidas ? { read: true } : {}), ...(i.id === g.primary.id ? patch : {}) })),
            }
          : g
      )
    );
  }

  // Saída da fila: 780ms de desfecho legível + 220ms de colapso (total 1000ms, pedido do dono). A
  // seleção e o foco avançam NA HORA (a triagem por teclado não espera a animação). Com movimento
  // reduzido a linha sai já — inclusive o temporizador: nada de esperar 1000ms por uma animação que
  // a pessoa desligou.
  function sairDaFila(key: string, desfecho: string, patch: Partial<TriagePub>, marcarLidas: boolean) {
    const prox = proximaChave(key);
    setSelectedKey(prox);
    setMarc((m) => {
      if (!m.has(key)) return m;
      const n = new Set(m);
      n.delete(key);
      return n;
    });
    focarLinha(prox);
    setLive(`${desfecho}.`);
    const aplicar = () => {
      patchGrupo(key, patch, marcarLidas);
      setDismissing((d) => {
        if (!(key in d)) return d;
        const n = { ...d };
        delete n[key];
        return n;
      });
    };
    if (reduzido()) {
      aplicar();
      return;
    }
    setDismissing((d) => ({ ...d, [key]: desfecho }));
    window.setTimeout(aplicar, DESFECHO_MS + COLAPSO_MS);
  }

  const snapshotDe = (g: TriageGroup): PublicationSnapshot[] =>
    g.items.map((i) => ({ id: i.id, assignedToId: i.assignedToId, triageStatus: i.triageStatus, deadlineGenerated: i.deadlineGenerated }));

  // ---- ações sobre UMA publicação ----
  function pedirArquivar() {
    if (!selected || busy) return;
    if (citaPrazoSemRegistro(selected)) setConfirmArchive(true);
    else void arquivar();
  }

  async function arquivar() {
    if (!selected || busy) return;
    const g = selected;
    const antes = snapshotDe(g).filter((s) => s.id === g.primary.id);
    const ids = g.items.map((i) => i.id);
    const eramNovas = g.items.filter((i) => !i.read).map((i) => i.id);
    setBusy(true);
    sairDaFila(g.key, "Só ciência registrada", { triageStatus: "TRATADA" }, true);
    try {
      await Promise.all([setPublicationTriageStatus(g.primary.id, "TRATADA"), markPublicationsRead(ids)]);
      showUndo({
        message: `Só ciência registrada. ${Math.max(0, navegaveis.length - 1)} na fila.`,
        durationMs: UNDO_MS,
        onUndo: async () => {
          await restorePublicationSnapshots(antes);
          await markPublicationsUnread(eramNovas);
          router.refresh();
        },
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function marcarVista() {
    if (busy) return;
    if (marc.size > 0) {
      await vistasLote(navegaveis.filter((g) => marc.has(g.key)));
      return;
    }
    if (!selected || selected.allRead) return;
    const g = selected;
    const novos = g.items.filter((i) => !i.read).map((i) => i.id);
    setBusy(true);
    patchGrupo(g.key, {}, true);
    try {
      await markPublicationsRead(novos);
      showUndo({
        message: "Marcada como vista. Continua em A tratar.",
        durationMs: UNDO_MS,
        onUndo: async () => {
          await markPublicationsUnread(novos);
          router.refresh();
        },
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function abrirTarefa(type: string) {
    if (!selected || busy) return;
    setTaskModal({ groupKey: selected.key, type, before: snapshotDe(selected) });
  }
  function abrirVinculo() {
    if (!selected || selected.primary.case || busy) return;
    setLinkModal(true);
  }

  // ---- ações sobre VÁRIAS (lote) ----
  const marcados = navegaveis.filter((g) => marc.has(g.key));

  async function vistasLote(grupos: TriageGroup[]) {
    const novas = grupos.filter((g) => !g.allRead);
    if (novas.length === 0) {
      setLive("Já estavam marcadas como vistas.");
      return;
    }
    setBusy(true);
    try {
      const res = await markPublicationsReadBatch(novas.map((g) => g.items.map((i) => i.id)));
      const ids = new Set(res.marcadas.flat());
      const desfazer = novas.flatMap((g) => g.items.filter((i) => !i.read && ids.has(i.id)).map((i) => i.id));
      setItems((prev) =>
        prev.map((g) => (g.items.some((i) => ids.has(i.id)) ? { ...g, allRead: true, items: g.items.map((i) => ({ ...i, read: true })) } : g))
      );
      setMarc(new Set());
      showUndo({
        message: `${res.marcadas.length} ${res.marcadas.length === 1 ? "marcada" : "marcadas"} como ${res.marcadas.length === 1 ? "vista" : "vistas"}. Continuam em A tratar.`,
        durationMs: UNDO_MS,
        onUndo: async () => {
          await markPublicationsUnread(desfazer);
          router.refresh();
        },
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function atribuirLote(keys: string[], userId: string) {
    const grupos = items.filter((g) => keys.includes(g.key));
    setBusy(true);
    try {
      const r = await assignPublicationsBatch(grupos.map((g) => g.items.map((i) => i.id)), userId);
      if (r.error || !r.before) {
        setLive(r.error ?? "Não foi possível atribuir.");
        return;
      }
      const antes = r.before;
      setItems((prev) =>
        prev.map((g) =>
          keys.includes(g.key)
            ? {
                ...g,
                primary: { ...g.primary, assignedToId: userId, triageStatus: g.primary.triageStatus === "PENDENTE" ? "EM_ANALISE" : g.primary.triageStatus },
                items: g.items.map((i) => ({ ...i, assignedToId: userId })),
              }
            : g
        )
      );
      setMarc(new Set());
      showUndo({
        message: `${grupos.length} ${grupos.length === 1 ? "atribuída" : "atribuídas"} a ${curtoDe(userId)}. O prazo continua com quem decide até ser registrado.`,
        durationMs: UNDO_MS,
        onUndo: async () => {
          await restorePublicationSnapshots(antes);
          router.refresh();
        },
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function registrarPrazoLote(linhas: { g: TriageGroup; due: string; resp: string }[], semData: number) {
    if (linhas.length === 0) return;
    setBusy(true);
    try {
      const antes = await getPublicationSnapshots(linhas.flatMap((l) => l.g.items.map((i) => i.id)));
      const taskIds: string[] = [];
      const feitos: typeof linhas = [];
      let falhas = 0;
      for (const l of linhas) {
        const r = await delegateTask({
          responsibleIds: [l.resp],
          type: "PRAZO",
          title: l.g.primary.content.slice(0, 50),
          dueDate: l.due,
          priority: "MEDIA",
          caseId: l.g.primary.case?.id,
          publicationId: l.g.primary.id,
        });
        if (r.error || !r.taskIds?.length) {
          falhas++;
          continue;
        }
        taskIds.push(...r.taskIds);
        feitos.push(l);
      }
      for (const l of feitos) {
        sairDaFila(l.g.key, `Prazo registrado para ${dm(l.due)} · ${curtoDe(l.resp)}`, { triageStatus: "TRATADA", assignedToId: l.resp, deadlineGenerated: true }, true);
      }
      setMarc(new Set());
      const feitosIds = new Set(feitos.flatMap((l) => l.g.items.map((i) => i.id)));
      showUndo({
        message: `${feitos.length} ${feitos.length === 1 ? "prazo registrado" : "prazos registrados"}${semData ? `; ${semData} sem data ficam na fila` : ""}${
          falhas ? `; ${falhas} não puderam ser registrados` : ""
        }.`,
        durationMs: UNDO_MS,
        onUndo: async () => {
          await undoPublicationDeadlines(taskIds, antes.filter((b) => feitosIds.has(b.id)));
          router.refresh();
        },
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function alternarMarca(key: string, comIntervalo: boolean) {
    setMarc((m) => {
      const n = new Set(m);
      if (comIntervalo && ancoraRef.current) {
        const a = navegaveis.findIndex((g) => g.key === ancoraRef.current);
        const b = navegaveis.findIndex((g) => g.key === key);
        if (a >= 0 && b >= 0) {
          const [de, ate] = a < b ? [a, b] : [b, a];
          for (let i = de; i <= ate; i++) n.add(navegaveis[i].key);
          return n;
        }
      }
      if (n.has(key)) n.delete(key);
      else n.add(key);
      ancoraRef.current = key;
      return n;
    });
  }

  function selecionarTodas(on: boolean) {
    setMarc(on ? new Set(navegaveis.map((g) => g.key)) : new Set());
  }

  // ---- teclado ----
  const algumDialogo = Boolean(dialogo || taskModal || linkModal || confirmArchive);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (algumDialogo) return; // Esc dos diálogos é tratado por eles
      const el = document.activeElement as HTMLElement | null;
      const tag = (el?.tagName || "").toLowerCase();
      const ehCaixa = tag === "input" && (el as HTMLInputElement).type === "checkbox";
      // Esc limpa a seleção mesmo com o foco numa caixa de seleção; as demais teclas não.
      if (e.key === "Escape" && ehCaixa && marc.size > 0) {
        e.preventDefault();
        setMarc(new Set());
        return;
      }
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (undoLast()) e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const emBotaoQualquer = (tag === "button" || tag === "a" || tag === "summary") && !el?.hasAttribute("data-row-main");
      const k = e.key;
      if (k === "Escape") {
        if (marc.size > 0) {
          e.preventDefault();
          setMarc(new Set());
        } else if (narrow && detalhe) {
          e.preventDefault();
          setDetalhe(false);
          focarLinha(selectedKey, true);
        }
        return;
      }
      if (k === "?") {
        e.preventDefault();
        setDialogo({ tipo: "atalhos" });
        return;
      }
      if (k === "u" || k === "U") {
        if (undoLast()) e.preventDefault();
        return;
      }
      if (!selected) return;
      if (k === "j" || k === "J" || k === "ArrowDown") {
        e.preventDefault();
        mover(1);
      } else if (k === "k" || k === "K" || k === "ArrowUp") {
        e.preventDefault();
        mover(-1);
      } else if (k === "x" || k === "X") {
        e.preventDefault();
        alternarMarca(selected.key, false);
      } else if (k === "Enter" || k === "p" || k === "P") {
        if (k === "Enter" && emBotaoQualquer) return;
        e.preventDefault();
        if (marc.size > 0) setDialogo({ tipo: "prazoLote", keys: marcados.map((g) => g.key) });
        else abrirTarefa("PRAZO");
      } else if (k === "d" || k === "D") {
        e.preventDefault();
        if (marc.size > 0) setDialogo({ tipo: "atribuir", keys: marcados.map((g) => g.key) });
        else abrirTarefa("TAREFA");
      } else if ((k === "v" || k === "V") && !selected.primary.case) {
        e.preventDefault();
        abrirVinculo();
      } else if ((k === "a" || k === "A") && marc.size === 0) {
        e.preventDefault();
        pedirArquivar();
      } else if (k === "l" || k === "L") {
        e.preventDefault();
        void marcarVista();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, algumDialogo, navegaveis, marc, narrow, detalhe, busy]);

  const taskGroup = taskModal ? items.find((g) => g.key === taskModal.groupKey) ?? null : null;
  const taskInitial: DelegateTaskInitial | undefined =
    taskGroup && taskModal
      ? {
          publicationId: taskGroup.primary.id,
          type: taskModal.type,
          title: taskGroup.primary.content.slice(0, 50),
          referTo: taskGroup.primary.case ? "PROCESSO" : "OUTROS",
          selectedLink: taskGroup.primary.case ? { id: taskGroup.primary.case.id, label: taskGroup.primary.case.title } : undefined,
          responsibleIds: taskGroup.primary.assignedToId ? [taskGroup.primary.assignedToId] : undefined,
          // O prazo NÃO é preenchido: só sugerido (botão "Usar sugestão" no formulário).
          dueSuggestion:
            taskModal.type === "PRAZO" && taskGroup.prazo.tipo === "PRAZO" && taskGroup.prazo.data
              ? { date: taskGroup.prazo.data, basis: basisDoPrazo(taskGroup.prazo) }
              : undefined,
        }
      : undefined;

  // Guarda o resultado em vez de já tirar a linha da fila — ela ainda está atrás do modal aberto;
  // o desfecho só faz sentido depois que o modal fecha (ver onClose abaixo).
  const [taskSuccess, setTaskSuccess] = useState<{ key: string; patch: Partial<TriagePub>; taskIds: string[]; texto: string; before: PublicationSnapshot[] } | null>(null);
  // A fila do servidor só substitui a cópia local quando NADA está em andamento: uma ação de servidor
  // revalida a página no meio do caminho (modal ainda aberto, linha ainda animando) e, sem esta
  // guarda, a linha sumia antes do desfecho de 780ms.
  const emAndamento = Boolean(taskModal) || Boolean(taskSuccess) || Object.keys(dismissing).length > 0;
  useEffect(() => {
    if (!emAndamento) setItems(groups);
  }, [groups, emAndamento]);

  function handleTaskSuccess(responsibleIds: string[], info: { taskIds: string[]; dueDate: string }) {
    if (!taskModal) return;
    const resp = responsibleIds[0] ?? null;
    const texto = taskModal.type === "PRAZO" ? `Prazo registrado para ${dm(info.dueDate)} · ${curtoDe(resp)}` : `Delegada a ${curtoDe(resp)}`;
    setTaskSuccess({
      key: taskModal.groupKey,
      patch: { assignedToId: resp, deadlineGenerated: true, triageStatus: "TRATADA" },
      taskIds: info.taskIds,
      texto,
      before: taskModal.before,
    });
  }

  const idxSel = selected ? navegaveis.findIndex((g) => g.key === selected.key) : -1;
  const vencidas = navegaveis.filter((g) => !g.registrado && g.situacao.faixa === "venc").length;

  // ---- JSX ----
  const linhaDe = (g: TriageGroup) => (
    <LinhaFila
      key={g.key}
      g={g}
      selecionada={g.key === selectedKey}
      marcada={marc.has(g.key)}
      saindo={dismissing[g.key]}
      rotulo={rotuloDaLinha(g, nomeDe)}
      responsavel={g.primary.assignedToId ? { ini: iniciais(nomeDe(g.primary.assignedToId)), nome: curtoDe(g.primary.assignedToId) } : null}
      onAbrir={() => {
        setSelectedKey(g.key);
        if (narrow) setDetalhe(true);
      }}
      onMarcar={(intervalo) => alternarMarca(g.key, intervalo)}
    />
  );

  const fila = (
    <section id="fila-publicacoes" aria-label="Fila de publicações" tabIndex={-1} className="relative flex-1 min-h-0 flex flex-col border-r-2 border-regua-forte bg-sf">
      <div className="shrink-0 flex items-center gap-2 border-b border-regua bg-sf-apoio min-h-11">
        <label className="w-11 grid place-items-center min-h-11 cursor-pointer" title="Selecionar todas as visíveis">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--acao)]"
            aria-label="Selecionar todas as publicações visíveis"
            checked={navegaveis.length > 0 && navegaveis.every((g) => marc.has(g.key))}
            ref={(el) => {
              if (el) el.indeterminate = marc.size > 0 && !navegaveis.every((g) => marc.has(g.key));
            }}
            onChange={(e) => selecionarTodas(e.target.checked)}
          />
        </label>
        <span className="text-xs text-tx-2 flex-1" aria-hidden="true">
          {navegaveis.length} {navegaveis.length === 1 ? "publicação" : "publicações"}
          {vencidas > 0 && <span className="font-bold text-risco-vencido-tx"> · {vencidas} {vencidas === 1 ? "vencida" : "vencidas"}</span>}
        </span>
        <div className="relative pr-2">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={maisFila}
            aria-label="Mais ações da fila"
            onClick={() => setMaisFila((v) => !v)}
            className="min-h-11 min-w-11 grid place-items-center text-tx-2 hover:text-tx hover:bg-regua"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          {maisFila && (
            <div role="menu" className="absolute right-2 top-11 z-20 w-72 bg-sf border border-regua-forte shadow-pop p-1">
              <button
                type="button"
                role="menuitem"
                className="w-full text-left min-h-11 px-3 py-2 text-sm hover:bg-sf-apoio flex flex-col justify-center"
                onClick={() => {
                  setMaisFila(false);
                  setDialogo({ tipo: "vistasRecorte" });
                }}
              >
                <span className="font-semibold text-tx">Marcar como vistas o recorte atual</span>
                <span className="text-xs text-tx-2">Não marca quem cita prazo.</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full text-left min-h-11 px-3 py-2 text-sm hover:bg-sf-apoio"
                onClick={() => {
                  setMaisFila(false);
                  setDialogo({ tipo: "atalhos" });
                }}
              >
                <span className="font-semibold text-tx">Atalhos de teclado</span> <kbd className="text-xs text-tx-2">?</kbd>
              </button>
            </div>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain">
        {agrupar
          ? BANDAS.map((b) => {
              const gs = visible.filter((g) => bandaDe(g) === b.k);
              if (gs.length === 0) return null;
              const conta = gs.filter((g) => !dismissing[g.key]).length;
              return (
                <section key={b.k} aria-labelledby={`banda-${b.k}`}>
                  <h2
                    id={`banda-${b.k}`}
                    className={clsx(
                      "sticky top-0 z-[2] m-0 flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide border-y",
                      b.tom === "venc" && "bg-campo-risco text-risco-vencido-tx border-campo-risco-linha",
                      b.tom === "hoje" && "bg-aviso-bg text-risco-hoje-tx border-linha-aviso",
                      b.tom === "neutro" && "bg-sf-apoio text-tx border-regua"
                    )}
                  >
                    {b.tom === "venc" ? <TriangleAlert size={14} aria-hidden="true" /> : b.tom === "hoje" ? <Clock size={14} aria-hidden="true" /> : null}
                    {b.titulo}
                    <span className="ml-auto font-semibold normal-case tracking-normal">{conta}</span>
                  </h2>
                  <ul className="list-none m-0 p-0">{gs.map(linhaDe)}</ul>
                </section>
              );
            })
          : (
            <ul className="list-none m-0 p-0">{visible.map(linhaDe)}</ul>
          )}
        {visible.length === 0 && <p className="p-6 text-sm text-tx-2">Nada por aqui.</p>}
      </div>

      {marc.size > 0 && (
        <div
          role="region"
          aria-label="Ações em lote"
          className="absolute md:absolute left-2 right-2 bottom-2 z-[6] bg-tx text-sf border border-regua-forte px-3 py-2 flex flex-col gap-2 max-md:fixed max-md:bottom-2"
        >
          <div className="flex items-center gap-2">
            <b className="text-sm">
              {marc.size} {marc.size === 1 ? "selecionada" : "selecionadas"}
            </b>
            <button type="button" className="ml-auto min-h-11 px-2 text-xs font-semibold underline" onClick={() => setMarc(new Set())}>
              Limpar seleção <kbd className="ml-1 opacity-80">Esc</kbd>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void vistasLote(marcados)} aria-keyshortcuts="L" className="flex-1 min-h-11 px-3 text-sm font-semibold border border-current inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              <Eye size={15} aria-hidden="true" /> Marcar vistas
            </button>
            <button type="button" disabled={busy} onClick={() => setDialogo({ tipo: "atribuir", keys: marcados.map((g) => g.key) })} aria-keyshortcuts="D" className="flex-1 min-h-11 px-3 text-sm font-semibold border border-current inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              <UserPlus size={15} aria-hidden="true" /> Atribuir
            </button>
            <button type="button" disabled={busy} onClick={() => setDialogo({ tipo: "prazoLote", keys: marcados.map((g) => g.key) })} aria-keyshortcuts="P" className="flex-1 min-h-11 px-3 text-sm font-semibold bg-acao text-acao-tx inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              <CalendarClock size={15} aria-hidden="true" /> Registrar prazo
            </button>
          </div>
        </div>
      )}
    </section>
  );

  const painel = selected ? (
    <Painel
      group={selected}
      nomeDe={nomeDe}
      carga={selected.primary.assignedToId ? carga[selected.primary.assignedToId] : undefined}
      busy={busy}
      narrow={narrow}
      posicao={idxSel >= 0 ? { i: idxSel + 1, total: navegaveis.length } : null}
      maisAberto={maisMobile}
      onMais={() => setMaisMobile((v) => !v)}
      onVoltar={() => {
        setDetalhe(false);
        focarLinha(selectedKey, true);
      }}
      detalheAberto={detalhe}
      onProxima={() => mover(1)}
      onRegistrar={() => abrirTarefa("PRAZO")}
      onDelegar={() => abrirTarefa("TAREFA")}
      onVincular={abrirVinculo}
      onSoCiencia={pedirArquivar}
      onVista={() => void marcarVista()}
    />
  ) : (
    <div className="flex-1 grid place-items-center p-6 text-center text-sm text-tx-2">
      <div>
        <p className="font-semibold text-tx">Nenhuma publicação selecionada</p>
        <p>Use J e K para percorrer a fila, ou clique numa linha.</p>
      </div>
    </div>
  );

  return (
    <div className="pub-scope flex flex-1 min-h-0 w-full">
      <p role="status" aria-live="polite" className="sr-only">
        {live}
      </p>
      <PainelDividido
        className="flex-1 w-full md:max-xl:!grid-cols-[minmax(300px,26rem)_minmax(0,1fr)] md:max-xl:!gap-0"
        chave="lumen:publicacoes:divisao"
        rotulo="Largura da fila e do teor da publicação"
        padrao={32}
        amplitude={12}
        esquerda={fila}
        direita={
          <div
            className={clsx(
              "min-w-0 min-h-0 flex-col bg-sf overflow-hidden",
              narrow ? (detalhe ? "flex fixed inset-0 z-40" : "hidden") : "flex flex-1"
            )}
            role={narrow && detalhe ? "dialog" : undefined}
            aria-modal={narrow && detalhe ? true : undefined}
            aria-label={selected ? `Leitura: ${partesDe(selected)}` : "Leitura da publicação"}
          >
            {painel}
          </div>
        }
      />

      {taskModal && taskGroup && taskInitial && (
        <ModalShell
          size="medio"
          title={taskModal.type === "PRAZO" ? "Registrar prazo" : "Delegar publicação"}
          onClose={() => {
            const key = taskModal.groupKey;
            setTaskModal(null);
            if (taskSuccess && taskSuccess.key === key) {
              const s = taskSuccess;
              sairDaFila(key, s.texto, s.patch, true);
              setTaskSuccess(null);
              showUndo({
                message: `${s.texto}. ${Math.max(0, navegaveis.length - 1)} na fila.`,
                durationMs: UNDO_MS,
                onUndo: async () => {
                  await undoPublicationDeadlines(s.taskIds, s.before);
                  router.refresh();
                },
              });
            }
            router.refresh();
          }}
        >
          <div className="overflow-y-auto scrollbar-thin flex-1">
            <DelegateTaskForm users={users} initial={taskInitial} onSuccess={handleTaskSuccess} />
          </div>
        </ModalShell>
      )}

      {confirmArchive && selected && (
        <ModalShell size="compacto" title="Registrar só ciência, sem registrar o prazo?" onClose={() => setConfirmArchive(false)}>
          <div className="p-5 space-y-4">
            <p className="text-sm text-tx">
              Esta publicação cita prazo{selected.prazo.tipo === "PRAZO" && selected.prazo.dias ? ` (${selected.prazo.dias} dias)` : ""}, e nenhum prazo foi registrado a partir dela.
              Se você registrar só ciência, ela sai da fila e ninguém mais a verá como pendente.
            </p>
            <div className="flex gap-2 justify-end flex-wrap">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setConfirmArchive(false);
                  abrirTarefa("PRAZO");
                }}
                className="min-h-11 px-4 py-2 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx"
              >
                Registrar prazo
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmArchive(false);
                  void arquivar();
                }}
                className="min-h-11 px-4 py-2 text-sm font-semibold text-tx-2 hover:bg-sf-apoio"
              >
                Só ciência mesmo assim
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {linkModal && selected && (
        <LinkModal
          group={selected}
          onClose={() => setLinkModal(false)}
          onLinked={(hit) => {
            if (!selected) return;
            setLinkModal(false);
            // Vincular a processo NÃO resolve a pendência: a linha continua na fila, agora com o processo.
            patchGrupo(selected.key, { case: { id: hit.id, title: hit.title, processNumber: hit.processNumber } }, false);
            setLive(`Vinculada ao processo ${hit.title}.`);
            router.refresh();
          }}
          onBlocked={(blockedId) => {
            if (!selected) return;
            const key = selected.key;
            const ids = selected.items.map((i) => i.id);
            const eramNovas = selected.items.filter((i) => !i.read).map((i) => i.id);
            void ids;
            setLinkModal(false);
            sairDaFila(key, "Processo bloqueado", {}, true);
            if (blockedId) {
              showUndo({
                message: "Processo bloqueado: você não vai mais receber publicações dele.",
                durationMs: UNDO_MS,
                onUndo: async () => {
                  await unblockProcessNumber(blockedId);
                  await markPublicationsUnread(eramNovas);
                  router.refresh();
                },
              });
            }
            router.refresh();
          }}
        />
      )}

      {dialogo?.tipo === "prazoLote" && (
        <PrazoLoteDialog
          grupos={items.filter((g) => dialogo.keys.includes(g.key))}
          viewerId={viewerId}
          onClose={() => setDialogo(null)}
          onConfirm={(linhas, semData) => {
            setDialogo(null);
            void registrarPrazoLote(linhas, semData);
          }}
          carga={carga}
          users={users}
        />
      )}
      {dialogo?.tipo === "atribuir" && (
        <AtribuirDialog
          quantas={dialogo.keys.length}
          users={users}
          carga={carga}
          onClose={() => setDialogo(null)}
          onConfirm={(userId) => {
            const keys = dialogo.keys;
            setDialogo(null);
            void atribuirLote(keys, userId);
          }}
        />
      )}
      {dialogo?.tipo === "vistasRecorte" && (
        <ModalShell size="compacto" title="Marcar como vistas o recorte atual" onClose={() => setDialogo(null)}>
          {(() => {
            const novas = navegaveis.filter((g) => !g.allRead);
            const citam = novas.filter(citaPrazo);
            const marcaveis = novas.length - citam.length;
            return (
              <div className="p-5 space-y-4">
                <p className="text-sm text-tx">
                  Marcar <b>{marcaveis}</b> de {navegaveis.length} como vistas.
                  {citam.length > 0 && <> {citam.length} {citam.length === 1 ? "cita prazo e fica" : "citam prazo e ficam"} sem marca, para você ler antes.</>}
                </p>
                <p className="text-xs text-tx-2">Vista é uma marca só sua e não tira nada de A tratar. Dá para desfazer por 10 segundos.</p>
                <div className="flex gap-2 justify-end flex-wrap">
                  <button type="button" onClick={() => setDialogo(null)} className="min-h-11 px-4 py-2 text-sm font-semibold text-tx-2 hover:bg-sf-apoio">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    autoFocus
                    disabled={marcaveis === 0}
                    onClick={() => {
                      setDialogo(null);
                      void vistasLote(navegaveis);
                    }}
                    className="min-h-11 px-4 py-2 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50"
                  >
                    Marcar {marcaveis}
                  </button>
                </div>
              </div>
            );
          })()}
        </ModalShell>
      )}
      {dialogo?.tipo === "atalhos" && (
        <ModalShell size="compacto" title="Atalhos de teclado" onClose={() => setDialogo(null)}>
          <dl className="p-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {[
              ["J / K", "próxima e anterior"],
              ["Enter ou P", "registrar prazo"],
              ["D", "delegar (com seleção: atribuir)"],
              ["V", "vincular a processo"],
              ["A", "só ciência"],
              ["L", "marcar como vista"],
              ["X", "selecionar a linha (Shift + clique: intervalo)"],
              ["U ou Ctrl+Z", "desfazer a última ação"],
              ["Esc", "limpar seleção"],
            ].map(([t, d]) => (
              <div key={t} className="contents">
                <dt>
                  <kbd className="border border-regua-forte px-1.5 py-0.5 text-xs">{t}</kbd>
                </dt>
                <dd className="text-tx-2">{d}</dd>
              </div>
            ))}
          </dl>
        </ModalShell>
      )}
    </div>
  );
}

function LinhaFila({
  g,
  selecionada,
  marcada,
  saindo,
  rotulo,
  responsavel,
  onAbrir,
  onMarcar,
}: {
  g: TriageGroup;
  selecionada: boolean;
  marcada: boolean;
  saindo?: string;
  rotulo: string;
  responsavel: { ini: string; nome: string } | null;
  onAbrir: () => void;
  onMarcar: (intervalo: boolean) => void;
}) {
  const pub = g.primary;
  const r = g.prazo;
  const fraseAto =
    r.tipo === "PRAZO" && r.dias
      ? `${r.dias} dias ${r.corridos ? "corridos" : "úteis"} no texto${r.confianca <= 1 ? ", confira" : ""}`
      : r.tipo === "CONFLITO"
        ? "números divergentes no texto, confira"
        : r.mencionaPrazo
          ? "cita prazo sem número"
          : "";
  const corpo = saindo ? (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] border-b border-regua bg-sf">
      <span aria-hidden="true" />
      <div className="py-6 pr-3 flex items-center gap-2 font-semibold text-tx">
        <CircleCheck size={18} className="text-risco-em-dia-tx shrink-0" aria-hidden="true" />
        {saindo}
      </div>
    </div>
  ) : (
    <div
      className={clsx(
        "grid grid-cols-[44px_minmax(0,1fr)] border-b border-regua",
        selecionada ? "bg-sf-apoio outline outline-2 -outline-offset-2 outline-marca-tx" : "bg-sf hover:bg-sf-apoio"
      )}
    >
      <label className="grid justify-items-center content-start pt-[13px] min-h-11 cursor-pointer">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--acao)] cursor-pointer"
          checked={marcada}
          onChange={() => {}}
          onClick={(e) => onMarcar(e.shiftKey)}
          aria-label={`Selecionar: ${partesDe(g)}`}
        />
      </label>
      <button
        type="button"
        data-row-main={g.key}
        aria-current={selecionada ? "true" : undefined}
        aria-label={rotulo}
        onClick={onAbrir}
        className="text-left py-3 pr-3 min-h-[76px] w-full grid gap-0.5 min-w-0"
      >
        <span className="flex items-baseline gap-2 min-w-0 max-md:flex-wrap">
          <span className={clsx("flex-1 min-w-0 text-corpo leading-snug text-tx truncate max-md:basis-full max-md:whitespace-normal max-md:line-clamp-2", g.allRead ? "font-medium text-tx-2" : "font-bold")}>
            {partesDe(g)}
          </span>
          <span className="max-md:order-first">
            <PrazoCelula g={g} compacto />
          </span>
        </span>
        <span className="text-sm text-tx-2 truncate">
          {fraseAto && <span className="font-semibold">{fraseAto} · </span>}
          {atoDe(pub.content)}
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-tx-2">
          {!g.allRead && <b className="text-marca-tx">Nova</b>}
          <span>
            {pub.source} · {pub.tribunalDetectado ?? pub.kind === "ANDAMENTO" ? "Andamento" : "Publicação"}
          </span>
          <span className={g.idadeDu >= IDADE_DESTAQUE_DU && !g.registrado ? "font-bold text-tx" : undefined}>
            publicada {dataDeBrasilia(pub.publishedAt).slice(0, 5)} ({g.idadeDu === 0 ? "hoje" : `há ${duTxt(g.idadeDu)}`})
          </span>
          {g.items.length > 1 && <span>+{g.items.length - 1} {g.items.length === 2 ? "fonte" : "fontes"}</span>}
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={clsx("h-5 w-5 grid place-items-center rounded-full border", responsavel ? "border-regua-forte bg-sf-apoio" : "border-dashed border-regua-forte")}>
              <span className="text-xs font-semibold leading-none text-tx">{responsavel ? responsavel.ini : "?"}</span>
            </span>
            {responsavel ? responsavel.nome : "sem responsável"}
          </span>
          {!pub.case && <span className="px-1.5 border border-linha-aviso bg-aviso-bg text-risco-hoje-tx">sem processo</span>}
          {g.registrado && <span className="px-1.5 border border-regua bg-sf text-risco-em-dia-tx">prazo criado</span>}
        </span>
      </button>
    </div>
  );
  return (
    <li className={clsx("pub-linha-fila", saindo && "pub-saindo")}>
      <div className={saindo ? "pub-saindo-in" : undefined}>{corpo}</div>
    </li>
  );
}

// Texto da publicação com o trecho de onde saiu a extração de prazo destacado (<mark>), para o
// advogado conferir a fonte no próprio texto.
function TeorComTrecho({ content, trecho }: { content: string; trecho?: string }) {
  if (!trecho) return <>{content}</>;
  const norm = content.replace(/ /g, " ");
  const i = norm.indexOf(trecho);
  if (i < 0) return <>{content}</>;
  return (
    <>
      {content.slice(0, i)}
      <mark className="bg-aviso-bg text-tx px-0.5 font-semibold">{content.slice(i, i + trecho.length)}</mark>
      {content.slice(i + trecho.length)}
    </>
  );
}

// O que o sistema entendeu do prazo, com a confiança, o motivo e como a data foi contada. Sempre
// "sugestão": quem decide o prazo é o advogado, com a íntegra na mão.
function BlocoPrazo({ group }: { group: TriageGroup }) {
  const p = group.prazo;
  const r = rotuloPrazo({ prazo: p, situacao: group.situacao, registrado: group.registrado, tratada: group.primary.triageStatus === "TRATADA" });
  const base = p.base ? p.base.split("-").reverse().join("/") : null;
  const Icone = r.tom === "venc" ? TriangleAlert : r.tom === "hoje" ? Clock : r.tom === "ok" ? CircleCheck : CircleHelp;
  return (
    <section
      aria-label="Prazo identificado no texto"
      className={clsx("max-w-[78ch] mt-5 border border-t-[3px] px-4 py-3 space-y-1.5", TOM_BLOCO[r.tom], r.tom === "venc" ? "border-t-risco-vencido" : r.tom === "hoje" ? "border-t-risco-hoje" : r.tom === "ok" ? "border-t-risco-em-dia" : "border-t-regua-forte")}
    >
      <p className={clsx("flex items-center gap-2 text-lg font-bold leading-snug", TOM_TEXTO[r.tom])}>
        <Icone size={20} aria-hidden="true" />
        {r.texto}
      </p>
      {p.tipo === "PRAZO" && p.data ? (
        <p className="text-sm text-tx">
          <span className="font-semibold">Prazo citado no texto: {p.dias} dias {p.corridos ? "corridos" : "úteis"}</span> → <strong>{formatCalendarDate(p.data)}</strong>{" "}
          <span className="text-tx-2">(sugestão do sistema, confira na íntegra)</span>
        </p>
      ) : p.tipo === "EVENTO" && p.data ? (
        <p className="text-sm text-tx">
          <span className="font-semibold">Data citada no texto: {formatCalendarDate(p.data)}{p.hora ? ` às ${p.hora}` : ""}</span> <span className="text-tx-2">(não é contagem de prazo)</span>
        </p>
      ) : p.tipo === "CONFLITO" ? (
        <p className="text-sm text-tx">Nenhuma data foi sugerida, para não induzir erro. Informe a data manualmente.</p>
      ) : group.primary.kind === "ANDAMENTO" && !p.mencionaPrazo ? (
        <p className="text-sm text-tx">Andamento sem prazo no texto: só ciência.</p>
      ) : (
        <p className="text-sm text-tx">
          Sem número de dias no texto, não sugerimos data. Publicada {group.idadeDu === 0 ? "hoje" : `há ${duTxt(group.idadeDu)}`}.
        </p>
      )}
      {p.tipo === "PRAZO" && (
        <p className="text-xs text-tx-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex gap-0.5" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={clsx("h-1.5 w-3.5 border border-tx-2", p.confianca >= n && "bg-tx")} />
            ))}
          </span>
          <span>
            <span className="font-semibold text-tx">Confiança {CONFIANCA_TXT[p.confianca]}.</span> {p.notas.join(" ")}
          </span>
        </p>
      )}
      {p.tipo !== "PRAZO" && p.notas.length > 0 && <p className="text-xs text-tx-2">{p.notas.join(" ")}</p>}
      {p.tipo === "PRAZO" && (
        <details className="text-xs text-tx-2">
          <summary className="cursor-pointer font-semibold text-marca-tx min-h-8 inline-flex items-center">Como calculamos</summary>
          <ol className="mt-1 pl-5 list-decimal space-y-1">
            <li>Início: publicação de {base} (dia em Brasília). Confira se o prazo corre da publicação, da disponibilização ou da ciência.</li>
            <li>{p.corridos ? `${p.dias} dias corridos; se terminar em dia não útil, seguimos para o próximo dia útil.` : `${p.dias} dias úteis, sem contar o dia da publicação.`}</li>
            <li>Pulamos sábados, domingos, feriados nacionais, feriados cadastrados pelo escritório e o recesso de 20/12 a 20/01 (CPC art. 220).</li>
            <li>Prazos especiais (Juizado, Fazenda, litisconsortes) não são considerados.</li>
          </ol>
        </details>
      )}
    </section>
  );
}

function Painel({
  group,
  nomeDe,
  carga,
  busy,
  narrow,
  detalheAberto,
  posicao,
  maisAberto,
  onMais,
  onVoltar,
  onProxima,
  onRegistrar,
  onDelegar,
  onVincular,
  onSoCiencia,
  onVista,
}: {
  group: TriageGroup;
  nomeDe: (id: string | null) => string;
  carga?: { abertas: number; vencidas: number };
  busy: boolean;
  narrow: boolean;
  detalheAberto: boolean;
  posicao: { i: number; total: number } | null;
  maisAberto: boolean;
  onMais: () => void;
  onVoltar: () => void;
  onProxima: () => void;
  onRegistrar: () => void;
  onDelegar: () => void;
  onVincular: () => void;
  onSoCiencia: () => void;
  onVista: () => void;
}) {
  const pub = group.primary;
  const aberta = pub.triageStatus !== "TRATADA";
  const voltarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // No celular o detalhe é uma tela cheia: o foco entra em "‹ Fila" ao abrir e a cada "Próxima".
    if (narrow && detalheAberto) voltarRef.current?.focus();
  }, [narrow, detalheAberto, group.key]);
  const secundario = "min-h-11 inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-tx-2 hover:text-tx hover:bg-sf-apoio border border-regua-forte disabled:opacity-50";
  return (
    <>
      {narrow && posicao && (
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-2 border-b border-regua bg-sf-apoio">
          <button ref={voltarRef} type="button" onClick={onVoltar} className="min-h-11 px-3 inline-flex items-center gap-1 text-sm font-semibold border border-regua-forte bg-sf">
            <ChevronLeft size={16} aria-hidden="true" /> Fila ({posicao.total})
          </button>
          <span className="ml-auto text-xs text-tx-2">
            {posicao.i} de {posicao.total}
          </span>
          <button type="button" onClick={onProxima} aria-label="Próxima publicação" className="min-h-11 px-3 inline-flex items-center gap-1 text-sm font-semibold border border-regua-forte bg-sf">
            Próxima <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 md:px-6 py-5">
        <p className="text-xs font-semibold text-tx-2">
          {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento"} · {pub.source}
          {pub.tribunalDetectado ? ` · ${pub.tribunalDetectado}` : ""} · publicada {dataDeBrasilia(pub.publishedAt)}
          {pub.lawyerTag ? ` · advogado citado: ${pub.lawyerTag}` : ""}
        </p>
        <h2 className="text-2xl font-bold text-tx mt-1 break-words">
          {pub.case ? (
            <TabLink href={`/processos/${pub.case.id}`} label={pub.case.title} className="hover:text-marca-tx transition-colors">
              {pub.case.title}
            </TabLink>
          ) : (
            partesDe(group)
          )}
        </h2>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {pub.case?.processNumber && <ProcessNumberChip processNumber={pub.case.processNumber} />}
          {!pub.case && pub.processNumberRaw && <span className="text-sm font-medium tabular-nums">{pub.processNumberRaw}</span>}
          <CopyButton text={pub.content} label="Copiar conteúdo" />
          <PeticionarButton compact caseId={pub.case?.id} />
        </div>

        <BlocoPrazo group={group} />

        <h3 className="mt-6 mb-1.5 text-xs font-bold uppercase tracking-wide text-tx-2">Teor</h3>
        <div className="max-w-[78ch] space-y-4">
          {group.items.map((item) => (
            <div key={item.id} className={group.items.length > 1 ? "border-t-2 border-regua-forte pt-4 first:border-t-0 first:pt-0" : ""}>
              {group.items.length > 1 && (
                <p className="text-xs font-bold uppercase tracking-wide text-tx-2 mb-1.5">
                  {item.source} · {dataDeBrasilia(item.publishedAt)}
                </p>
              )}
              <p className="text-corpo leading-[1.6] text-tx whitespace-pre-wrap break-words">
                <TeorComTrecho content={item.content} trecho={group.prazo.itemId === item.id ? group.prazo.trecho : undefined} />
              </p>
            </div>
          ))}
        </div>

        <dl className="mt-6 border-t border-regua max-w-[78ch]">
          <div className="grid md:grid-cols-[104px_minmax(0,1fr)] gap-x-2 py-2.5 border-b border-regua text-sm items-baseline">
            <dt className="text-xs font-bold uppercase tracking-wide text-tx-2">Processo</dt>
            <dd className="min-w-0">
              {pub.case ? (
                <>
                  {pub.case.title}
                  <span className="block text-xs text-tx-2">Pasta no Drive e andamentos do processo.</span>
                </>
              ) : (
                <>
                  <span className="px-1.5 border border-linha-aviso bg-aviso-bg text-risco-hoje-tx text-xs">sem processo vinculado{pub.tribunalDetectado ? ` · ${pub.tribunalDetectado}` : ""}</span>{" "}
                  {aberta && (
                    <button type="button" onClick={onVincular} className="min-h-11 md:min-h-8 px-1 font-semibold text-marca-tx underline underline-offset-2">
                      Vincular processo
                    </button>
                  )}
                </>
              )}
            </dd>
          </div>
          <div className="grid md:grid-cols-[104px_minmax(0,1fr)] gap-x-2 py-2.5 border-b border-regua text-sm items-baseline">
            <dt className="text-xs font-bold uppercase tracking-wide text-tx-2">Agenda</dt>
            <dd className="min-w-0">
              {group.registrado ? (
                <>Prazo criado a partir desta publicação<span className="block text-xs text-tx-2">A tarefa e o evento estão na Agenda de {pub.assignedToId ? nomeDe(pub.assignedToId) : "quem recebeu"}.</span></>
              ) : (
                <>Nenhuma tarefa ou evento ligado.<span className="block text-xs text-tx-2">Registrar prazo cria a tarefa e o evento na Agenda{pub.assignedToId ? ` de ${nomeDe(pub.assignedToId)}` : ""}.</span></>
              )}
            </dd>
          </div>
          <div className="grid md:grid-cols-[104px_minmax(0,1fr)] gap-x-2 py-2.5 border-b border-regua text-sm items-baseline">
            <dt className="text-xs font-bold uppercase tracking-wide text-tx-2">Responsável</dt>
            <dd className="min-w-0">
              {pub.assignedToId ? (
                <>
                  {nomeDe(pub.assignedToId)}
                  {carga && (
                    <span className="block text-xs text-tx-2">
                      {carga.abertas} {carga.abertas === 1 ? "aberta" : "abertas"} · {carga.vencidas} {carga.vencidas === 1 ? "vencida" : "vencidas"}
                    </span>
                  )}
                </>
              ) : (
                "Sem responsável"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div role="group" aria-label="Decidir esta publicação" className="shrink-0 border-t-2 border-regua-forte bg-sf px-4 md:px-6 py-3 max-md:pr-20 flex items-center gap-2 flex-wrap relative">
        {aberta ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onRegistrar}
              aria-keyshortcuts="P"
              className="min-h-11 max-md:flex-1 max-md:min-h-12 inline-flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4"
            >
              <CalendarClock size={15} aria-hidden="true" /> Registrar prazo <kbd className="max-xl:hidden text-xs border border-current px-1 opacity-80">P</kbd>
            </button>
            <div className="contents max-md:hidden">
              <button type="button" disabled={busy} onClick={onDelegar} aria-keyshortcuts="D" className={secundario}>
                <UserPlus size={15} aria-hidden="true" /> Delegar <kbd className="max-xl:hidden text-xs border border-current px-1 opacity-70">D</kbd>
              </button>
              {!pub.case && (
                <button type="button" disabled={busy} onClick={onVincular} aria-keyshortcuts="V" className={secundario}>
                  <FilePlus2 size={15} aria-hidden="true" /> Vincular <kbd className="max-xl:hidden text-xs border border-current px-1 opacity-70">V</kbd>
                </button>
              )}
              <button type="button" disabled={busy} onClick={onSoCiencia} aria-keyshortcuts="A" className={secundario}>
                <Archive size={15} aria-hidden="true" /> Só ciência <kbd className="max-xl:hidden text-xs border border-current px-1 opacity-70">A</kbd>
              </button>
              <button
                type="button"
                disabled={busy || group.allRead}
                onClick={onVista}
                aria-keyshortcuts="L"
                title="Marca só para você; a publicação continua em A tratar para o escritório"
                className={secundario}
              >
                <Eye size={15} aria-hidden="true" /> {group.allRead ? "Vista" : "Marcar vista"}
              </button>
            </div>
            <button type="button" onClick={onMais} aria-expanded={maisAberto} className="md:hidden min-h-12 px-4 inline-flex items-center gap-1.5 text-sm font-semibold border border-regua-forte">
              <MoreHorizontal size={18} aria-hidden="true" /> Mais
            </button>
            {maisAberto && (
              <div className="md:hidden absolute bottom-full left-3 right-3 mb-1 bg-sf border border-regua-forte shadow-pop p-1 grid gap-1 z-10">
                <button type="button" onClick={onDelegar} className="min-h-12 text-left px-3 text-sm font-semibold hover:bg-sf-apoio inline-flex items-center gap-2"><UserPlus size={16} aria-hidden="true" /> Delegar</button>
                {!pub.case && <button type="button" onClick={onVincular} className="min-h-12 text-left px-3 text-sm font-semibold hover:bg-sf-apoio inline-flex items-center gap-2"><FilePlus2 size={16} aria-hidden="true" /> Vincular a processo</button>}
                <button type="button" onClick={onSoCiencia} className="min-h-12 text-left px-3 text-sm font-semibold hover:bg-sf-apoio inline-flex items-center gap-2"><Archive size={16} aria-hidden="true" /> Só ciência</button>
                {!group.allRead && <button type="button" onClick={onVista} className="min-h-12 text-left px-3 text-sm font-semibold hover:bg-sf-apoio inline-flex items-center gap-2"><Eye size={16} aria-hidden="true" /> Marcar vista</button>}
              </div>
            )}
            <span className="ml-auto text-xs text-tx-2 max-xl:hidden">J/K navega · X seleciona · U desfaz · ? atalhos</span>
          </>
        ) : (
          <span className="text-sm text-tx-2">Publicação tratada.</span>
        )}
      </div>
    </>
  );
}

function PrazoLoteDialog({
  grupos,
  viewerId,
  users,
  carga,
  onClose,
  onConfirm,
}: {
  grupos: TriageGroup[];
  viewerId: string;
  users: UserLite[];
  carga: CargaPorPessoa;
  onClose: () => void;
  onConfirm: (linhas: { g: TriageGroup; due: string; resp: string }[], semData: number) => void;
}) {
  // Os campos abrem VAZIOS: cada data é uma decisão do advogado ("Usar sugestão" por linha ou todas).
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [respPadrao, setRespPadrao] = useState(viewerId);
  const sug = (g: TriageGroup) => (g.prazo.tipo === "PRAZO" && g.prazo.data ? g.prazo.data : null);
  const comSug = grupos.filter((g) => sug(g));
  const preenchidas = grupos.filter((g) => datas[g.key]);
  return (
    <ModalShell size="medio" title={`Registrar prazo em ${grupos.length} ${grupos.length === 1 ? "publicação" : "publicações"}`} subtitle="Cria uma tarefa com prazo e o evento na Agenda para cada linha com data. Linhas sem data continuam na fila." onClose={onClose}>
      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        <p className="text-sm text-tx-2">Os campos abrem vazios. Use a sugestão de cada linha ou confirme todas de uma vez.</p>
        <button
          type="button"
          disabled={comSug.length === 0}
          onClick={() => setDatas((d) => ({ ...d, ...Object.fromEntries(comSug.map((g) => [g.key, sug(g)!])) }))}
          className="min-h-11 px-3 text-sm font-semibold border border-regua-forte bg-sf-apoio hover:bg-regua disabled:opacity-50"
        >
          Usar as {comSug.length} sugestões de prazo identificado
        </button>
        <ul className="list-none m-0 p-0 space-y-2">
          {grupos.map((g) => (
            <li key={g.key} className="grid md:grid-cols-[minmax(0,1fr)_170px] gap-2 border-b border-regua pb-2 items-center">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-tx break-words">{partesDe(g)}</p>
                <p className="text-xs text-tx-2">
                  {sug(g) ? `Sugestão ${dm(sug(g)!)}, confiança ${CONFIANCA_TXT[g.prazo.confianca]}` : "Prazo não identificado: informe a data"}
                </p>
              </div>
              <div className="grid gap-1">
                <label className="sr-only" htmlFor={`pl-${g.key}`}>Prazo fatal de {partesDe(g)}</label>
                <input id={`pl-${g.key}`} type="date" value={datas[g.key] ?? ""} onChange={(e) => setDatas((d) => ({ ...d, [g.key]: e.target.value }))} className="w-full border border-regua-forte px-3 min-h-11 text-sm bg-sf text-tx" />
                {sug(g) && (
                  <button type="button" onClick={() => setDatas((d) => ({ ...d, [g.key]: sug(g)! }))} className="min-h-9 text-xs font-semibold border border-regua bg-sf-apoio hover:bg-regua">
                    Usar {dm(sug(g)!)}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div>
          <label htmlFor="pl-resp" className="text-xs font-bold text-tx-2">Responsável quando a publicação não tiver</label>
          <select id="pl-resp" value={respPadrao} onChange={(e) => setRespPadrao(e.target.value)} className="w-full mt-1 border border-regua-forte px-3 min-h-11 text-sm bg-sf text-tx">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {carga[u.id] ? ` — ${carga[u.id].abertas} abertas, ${carga[u.id].vencidas} vencidas` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 justify-end flex-wrap pt-2 border-t border-regua">
          <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm font-semibold text-tx-2 hover:bg-sf-apoio">Cancelar</button>
          <button
            type="button"
            disabled={preenchidas.length === 0}
            onClick={() => onConfirm(preenchidas.map((g) => ({ g, due: datas[g.key], resp: g.primary.assignedToId ?? respPadrao })), grupos.length - preenchidas.length)}
            className="min-h-11 px-5 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50"
          >
            Registrar {preenchidas.length} {preenchidas.length === 1 ? "prazo" : "prazos"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function AtribuirDialog({
  quantas,
  users,
  carga,
  onClose,
  onConfirm,
}: {
  quantas: number;
  users: UserLite[];
  carga: CargaPorPessoa;
  onClose: () => void;
  onConfirm: (userId: string) => void;
}) {
  const [sel, setSel] = useState("");
  return (
    <ModalShell size="compacto" title={`Atribuir ${quantas} ${quantas === 1 ? "publicação" : "publicações"} a`} subtitle="A pessoa recebe a publicação na fila dela. O prazo continua sendo seu até ela registrar." onClose={onClose}>
      <div className="p-5 space-y-3 overflow-y-auto flex-1">
        <fieldset className="grid gap-1.5">
          <legend className="sr-only">Responsável</legend>
          {users.map((u) => (
            <label key={u.id} className={clsx("flex items-center gap-3 min-h-11 px-3 border cursor-pointer text-sm", sel === u.id ? "border-tx bg-sf-apoio font-semibold" : "border-regua-forte bg-sf")}>
              <input type="radio" name="atribuir-para" value={u.id} checked={sel === u.id} onChange={() => setSel(u.id)} className="accent-[var(--acao)]" />
              <span>
                {u.name}
                {carga[u.id] && <small className="block text-xs text-tx-2 font-normal">{carga[u.id].abertas} abertas · {carga[u.id].vencidas} vencidas</small>}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2 justify-end flex-wrap pt-2 border-t border-regua">
          <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm font-semibold text-tx-2 hover:bg-sf-apoio">Cancelar</button>
          <button type="button" disabled={!sel} onClick={() => onConfirm(sel)} className="min-h-11 px-5 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50 inline-flex items-center gap-1.5">
            <Users size={15} aria-hidden="true" /> Atribuir
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// Modal de "Vincular a processo" (tecla V ou botão) — busca processo já cadastrado; se não
// houver processo, "Cadastrar novo processo" segue pra tela de Novo Processo já pré-preenchida
// (mesma query publicationId/processNumber de antes, ver components/LinkPublicationMenu.tsx).
// "Bloquear" (só quando há número de processo identificado) mora aqui dentro em vez de virar uma
// 5ª ação na barra do teor — documento 05 define só 4 ações na barra; bloquear é um desfecho raro
// dentro do MESMO fluxo de "isto não tem processo", igual já era em LinkPublicationMenu.
function LinkModal({
  group,
  onClose,
  onLinked,
  onBlocked,
}: {
  group: TriageGroup;
  onClose: () => void;
  onLinked: (hit: CaseHit) => void;
  onBlocked: (blockedId?: string) => void;
}) {
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
    const res = await blockProcessNumber(group.primary.id);
    setBlocking(false);
    setBlockConfirm(false);
    onClose();
    onBlocked(res.blockedId);
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
          <Link href={newCaseHref} className="flex items-center gap-2 text-xs font-semibold text-marca-tx hover:text-tx px-1 py-1.5">
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
                className="px-4 py-2 text-sm font-semibold bg-atencao hover:opacity-90 text-rotulo disabled:opacity-50"
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
