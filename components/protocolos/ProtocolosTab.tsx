"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  X,
  Plus,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  Stamp,
  Ban,
  RefreshCw,
  Search,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Undo2,
  CalendarClock,
  Link2,
  Download,
} from "lucide-react";
import ModalShell from "@/components/ModalShell";
import {
  createProtocoloLote,
  updateProtocoloLoteItens,
  gerarPastaDoLote,
  registrarProtocolo,
  cancelarProtocoloLote,
  marcarProtocoloPronto,
  reabrirProtocoloLote,
  sugerirDocumentosProtocolo,
  getDocumentosJaProtocolados,
  getVinculoTarefa,
  listarTasksDoCaso,
  vincularTaskAoLote,
  criarTarefaDoLote,
  desvincularTaskDoLote,
  type DocumentoJaProtocolado,
  type TarefaVinculada,
} from "@/lib/actions/protocolos";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { Badge, formatCalendarDate } from "@/components/ui";
import { EnviarDocumentosButton, HistoricoEnvios, type Envio } from "@/components/DocumentoEnvios";

type AttachmentOption = { id: string; name: string; docType: string; driveUrl: string };
type LoteItem = { id: string; ordem: number; attachmentId: string | null; nomeSnapshot: string; docTypeSnapshot: string; driveUrl: string | null };
type Lote = {
  id: string;
  titulo: string;
  status: string;
  numeroProtocolo: string | null;
  protocoladoEm: string | null;
  driveFolderId: string | null;
  criadoPor: { name: string } | null;
  protocoladoPor: { name: string } | null;
  comprovante: { id: string; name: string; driveUrl: string } | null;
  createdAt: string;
  itens: LoteItem[];
};

const STATUS_LABEL: Record<string, string> = {
  EM_PREPARO: "Em preparo",
  PRONTO: "Pronto",
  PROTOCOLADO: "Protocolado",
  CANCELADO: "Cancelado",
};
const STATUS_COLOR: Record<string, "slate" | "gold" | "green" | "red"> = {
  EM_PREPARO: "slate",
  PRONTO: "gold",
  PROTOCOLADO: "green",
  CANCELADO: "red",
};

export default function ProtocolosTab({
  caseId,
  caseTitle,
  attachments,
  lotes,
  envios,
  driveConnected,
}: {
  caseId: string;
  caseTitle: string;
  attachments: AttachmentOption[];
  lotes: Lote[];
  envios: Envio[];
  driveConnected: boolean;
}) {
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<Lote | null>(null);
  const [registrando, setRegistrando] = useState<Lote | null>(null);

  // Tarefa/prazo vinculado a cada lote (ver lib/actions/protocolos.ts) — buscado à parte porque a
  // lista de lotes vem pronta da página do servidor (app/(app)/processos/[id]/page.tsx, fora do
  // escopo desta aba) e não inclui esse vínculo; uma única consulta em lote para todos os cards
  // visíveis, refeita sempre que a lista de lotes muda.
  const [tarefas, setTarefas] = useState<Record<string, TarefaVinculada>>({});
  const loteIds = useMemo(() => lotes.map((l) => l.id).join(","), [lotes]);
  useEffect(() => {
    let cancelado = false;
    if (!loteIds) {
      setTarefas({});
      return;
    }
    getVinculoTarefa(loteIds.split(",")).then((res) => {
      if (!cancelado) setTarefas(res);
    });
    return () => {
      cancelado = true;
    };
  }, [loteIds]);
  function refetchTarefas() {
    if (!loteIds) return;
    getVinculoTarefa(loteIds.split(",")).then(setTarefas);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs font-semibold text-tx-2 font-mono tabular-nums">
          {lotes.length === 0 ? "Nenhum protocolo ainda" : `${lotes.length} protocolo${lotes.length > 1 ? "s" : ""}`}
        </p>
        <div className="flex items-center gap-2">
          <EnviarDocumentosButton entity={{ tipo: "CASE", id: caseId, titulo: caseTitle }} attachments={attachments} />
          <button
            onClick={() => setNovoOpen(true)}
            className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <Plus size={16} /> Novo protocolo
          </button>
        </div>
      </div>

      {lotes.length === 0 ? (
        <p className="text-sm text-tx-2 py-6 text-center">
          Um protocolo é a lista dos documentos enviados (ou a enviar) ao tribunal/órgão — nenhum arquivo é duplicado, só referenciado.
        </p>
      ) : (
        <div className="space-y-3">
          {lotes.map((lote) => (
            <LoteCard
              key={lote.id}
              caseId={caseId}
              lote={lote}
              driveConnected={driveConnected}
              tarefa={tarefas[lote.id] ?? null}
              onTarefaAtualizada={refetchTarefas}
              onEditar={() => setEditando(lote)}
              onRegistrar={() => setRegistrando(lote)}
            />
          ))}
        </div>
      )}

      <HistoricoEnvios entity={{ tipo: "CASE", id: caseId, titulo: caseTitle }} envios={envios} />

      {novoOpen && <SelecaoModal caseId={caseId} attachments={attachments} onClose={() => setNovoOpen(false)} />}
      {editando && (
        <SelecaoModal
          caseId={caseId}
          attachments={attachments}
          lote={editando}
          onClose={() => setEditando(null)}
        />
      )}
      {registrando && <RegistrarModal caseId={caseId} lote={registrando} onClose={() => setRegistrando(null)} />}
    </div>
  );
}

function LoteCard({
  caseId,
  lote,
  driveConnected,
  tarefa,
  onTarefaAtualizada,
  onEditar,
  onRegistrar,
}: {
  caseId: string;
  lote: Lote;
  driveConnected: boolean;
  tarefa: TarefaVinculada | null;
  onTarefaAtualizada: () => void;
  onEditar: () => void;
  onRegistrar: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [tarefaModalOpen, setTarefaModalOpen] = useState(false);
  const editavel = lote.status === "EM_PREPARO" || lote.status === "PRONTO";

  async function handleGerarPasta() {
    setPending(true);
    setError("");
    const res = await gerarPastaDoLote(lote.id);
    setPending(false);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function handleCancelar() {
    if (!window.confirm(`Cancelar o protocolo "${lote.titulo}"? A pasta no Drive (se houver) será apagada — os documentos originais não são afetados.`)) return;
    setPending(true);
    setError("");
    const res = await cancelarProtocoloLote(lote.id);
    setPending(false);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function handleMarcarPronto() {
    setPending(true);
    setError("");
    const res = await marcarProtocoloPronto(lote.id);
    setPending(false);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function handleReabrir() {
    setPending(true);
    setError("");
    const res = await reabrirProtocoloLote(lote.id);
    setPending(false);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function handleDesvincularTarefa() {
    setPending(true);
    await desvincularTaskDoLote(lote.id);
    setPending(false);
    onTarefaAtualizada();
  }

  return (
    <div className="border border-regua p-4 bg-sf">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-tx">{lote.titulo}</p>
          <p className="text-xs text-tx-2 mt-0.5 font-mono tabular-nums">
            {lote.status === "PROTOCOLADO"
              ? `protocolado ${lote.protocoladoEm ? formatCalendarDate(lote.protocoladoEm) : ""} · nº ${lote.numeroProtocolo} · ${lote.itens.length} documento(s) · ${lote.protocoladoPor?.name ?? "—"}`
              : `${lote.itens.length} documento(s) · criado por ${lote.criadoPor?.name ?? "—"}`}
          </p>
        </div>
        <Badge color={STATUS_COLOR[lote.status] ?? "slate"}>{STATUS_LABEL[lote.status] ?? lote.status}</Badge>
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {tarefa ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-tx-2 bg-sf-apoio rounded-full pl-2 pr-1 py-0.5">
            <CalendarClock size={11} />
            {tarefa.title} · {formatCalendarDate(tarefa.dueDate)}
            {editavel && (
              <button
                onClick={handleDesvincularTarefa}
                disabled={pending}
                title="Desvincular tarefa"
                className="text-tx-2 hover:text-atencao rounded-full p-0.5"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ) : (
          editavel && (
            <button
              onClick={() => setTarefaModalOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-tx-2 hover:text-tx rounded-full px-2 py-0.5 hover:bg-sf-apoio"
            >
              <Link2 size={11} /> Vincular prazo
            </button>
          )
        )}
      </div>

      <div className="mt-3 divide-y divide-regua border-t border-regua">
        {lote.itens.map((item) => (
          <div key={item.id} className="flex items-center gap-2 py-1.5 text-sm">
            <span className="font-mono text-xs text-tx-2 w-6 shrink-0 tabular-nums">{String(item.ordem).padStart(2, "0")}</span>
            <span className="flex-1 min-w-0 truncate text-tx" title={item.nomeSnapshot}>
              {item.nomeSnapshot}
              {!item.attachmentId && <span className="text-[10px] text-urgente ml-1.5">(excluído do processo)</span>}
            </span>
            <span className="text-[10px] text-tx-2 font-mono shrink-0">{getDocumentTypeLabel(item.docTypeSnapshot)}</span>
            {item.driveUrl && (
              <a href={item.driveUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-marca-tx shrink-0 flex items-center gap-0.5">
                abrir <ExternalLink size={10} />
              </a>
            )}
          </div>
        ))}
        {lote.comprovante && (
          <div className="flex items-center gap-2 py-1.5 text-sm">
            <Stamp size={13} className="text-tx-2 shrink-0" />
            <span className="flex-1 min-w-0 truncate text-tx">{lote.comprovante.name}</span>
            <a href={lote.comprovante.driveUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-marca-tx shrink-0 flex items-center gap-0.5">
              abrir <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-urgente mt-2">{error}</p>}

      {editavel && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-regua">
          <button
            onClick={onRegistrar}
            className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5 "
          >
            <Stamp size={13} /> Registrar protocolo
          </button>
          {lote.status === "EM_PREPARO" ? (
            <button
              onClick={handleMarcarPronto}
              disabled={pending}
              title="Exige procuração anexada ao processo (aba Anexos)"
              className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio disabled:opacity-50"
            >
              <CheckCircle2 size={13} /> Marcar como pronto
            </button>
          ) : (
            <button
              onClick={handleReabrir}
              disabled={pending}
              className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio disabled:opacity-50"
            >
              <Undo2 size={13} /> Voltar para em preparo
            </button>
          )}
          <button onClick={onEditar} className="text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio">
            Editar seleção
          </button>
          {driveConnected && (
            <button
              onClick={handleGerarPasta}
              disabled={pending}
              className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio disabled:opacity-50"
            >
              {lote.driveFolderId ? <RefreshCw size={13} /> : <FolderOpen size={13} />}
              {pending ? "Gerando..." : lote.driveFolderId ? "Regenerar pasta no Drive" : "Gerar pasta no Drive"}
            </button>
          )}
          {driveConnected && lote.itens.length > 0 && (
            <a
              href={`/api/protocolos/${lote.id}/zip`}
              className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio"
            >
              <Download size={13} /> Baixar tudo (.zip)
            </a>
          )}
          <button
            onClick={handleCancelar}
            disabled={pending}
            className="flex items-center gap-1.5 text-xs font-semibold text-atencao hover:bg-atencao/10 px-3 py-1.5 ml-auto disabled:opacity-50"
          >
            <Ban size={13} /> Cancelar
          </button>
        </div>
      )}

      {!editavel && lote.status === "PROTOCOLADO" && driveConnected && lote.itens.length > 0 && (
        <div className="mt-3 pt-3 border-t border-regua">
          <a
            href={`/api/protocolos/${lote.id}/zip`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 hover:bg-sf-apoio"
          >
            <Download size={13} /> Baixar tudo (.zip)
          </a>
        </div>
      )}

      {tarefaModalOpen && (
        <TarefaModal
          caseId={caseId}
          loteId={lote.id}
          onClose={() => setTarefaModalOpen(false)}
          onVinculada={() => {
            setTarefaModalOpen(false);
            onTarefaAtualizada();
          }}
        />
      )}
    </div>
  );
}

// Vincula um prazo/tarefa a um lote (item 5 da Fase 3/4): escolher uma tarefa já existente do
// processo, ou criar uma nova rapidinho (título + data), sem sair da aba Protocolos.
function TarefaModal({
  caseId,
  loteId,
  onClose,
  onVinculada,
}: {
  caseId: string;
  loteId: string;
  onClose: () => void;
  onVinculada: () => void;
}) {
  const [tasks, setTasks] = useState<{ id: string; title: string; dueDate: string; status: string }[] | null>(null);
  const [modo, setModo] = useState<"existente" | "nova">("existente");
  const [taskId, setTaskId] = useState("");
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaData, setNovaData] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarTasksDoCaso(caseId).then((res) => {
      setTasks(res);
      if (res.length === 0) setModo("nova");
    });
  }, [caseId]);

  async function handleConfirm() {
    setError("");
    if (modo === "existente") {
      if (!taskId) {
        setError("Escolha uma tarefa.");
        return;
      }
      setLoading(true);
      const res = await vincularTaskAoLote({ loteId, taskId });
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
    } else {
      if (!novoTitulo.trim() || !novaData) {
        setError("Dê um título e uma data ao prazo.");
        return;
      }
      setLoading(true);
      const res = await criarTarefaDoLote({ loteId, title: novoTitulo.trim(), dueDate: novaData });
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
    }
    onVinculada();
  }

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-sf shadow-modal w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
          <h3 className="font-bold text-tx">Vincular prazo</h3>
          <button onClick={onClose} className="text-tx-2 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {tasks && tasks.length > 0 && (
            <div className="flex gap-1.5 text-xs font-semibold">
              <button
                onClick={() => setModo("existente")}
                className={`px-2.5 py-1 ${modo === "existente" ? "bg-acao text-acao-tx" : "text-tx-2 hover:bg-sf-apoio"}`}
              >
                Tarefa existente
              </button>
              <button
                onClick={() => setModo("nova")}
                className={`px-2.5 py-1 ${modo === "nova" ? "bg-acao text-acao-tx" : "text-tx-2 hover:bg-sf-apoio"}`}
              >
                Criar nova
              </button>
            </div>
          )}

          {modo === "existente" ? (
            <div>
              <label className="text-xs font-medium text-tx-2">Tarefa do processo</label>
              {tasks === null ? (
                <p className="text-xs text-tx-2 mt-1">Carregando…</p>
              ) : tasks.length === 0 ? (
                <p className="text-xs text-tx-2 mt-1">Este processo ainda não tem tarefas. Crie uma nova abaixo.</p>
              ) : (
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
                >
                  <option value="">Selecione…</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} — {formatCalendarDate(t.dueDate)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-tx-2">Título do prazo</label>
                <input
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Protocolar Petição Inicial"
                  className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-tx-2">Data limite</label>
                <input
                  type="date"
                  value={novaData}
                  onChange={(e) => setNovaData(e.target.value)}
                  className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
                />
              </div>
            </>
          )}

          {error && <p className="text-xs font-medium text-urgente">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-regua">
          <button onClick={onClose} className="text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {loading ? "Vinculando..." : "Vincular"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Passo único de seleção + ordenação — reaproveitado tanto para "Novo protocolo" quanto para
// "Editar seleção" de um lote existente (nesse caso `lote` vem preenchido e o título não muda).
function SelecaoModal({
  caseId,
  attachments,
  lote,
  onClose,
}: {
  caseId: string;
  attachments: AttachmentOption[];
  lote?: Lote;
  onClose: () => void;
}) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(lote?.titulo ?? "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(
    lote ? lote.itens.filter((i) => i.attachmentId).map((i) => i.attachmentId as string) : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sugestão de documentos (item 1) — só faz sentido montando um lote NOVO: editando um lote já
  // existente a pessoa já fez a escolha antes, sugerir de novo em cima disso teria mais chance de
  // confundir do que ajudar. Ver sugerirDocumentos em lib/protocolos.ts para a heurística.
  const [sugestao, setSugestao] = useState<{ attachmentIds: string[]; motivo: string } | null>(null);
  useEffect(() => {
    if (lote) return;
    sugerirDocumentosProtocolo(caseId).then((res) => {
      if (!res.error) setSugestao(res);
    });
  }, [caseId, lote]);
  const sugeridosSet = useMemo(() => new Set(sugestao?.attachmentIds ?? []), [sugestao]);
  const sugeridosPendentes = useMemo(() => [...sugeridosSet].filter((id) => !selected.includes(id)), [sugeridosSet, selected]);

  // Aviso "já protocolado em outro lote" (item 2) — não-bloqueante, ver getDocumentosJaProtocolados.
  const [jaProtocolados, setJaProtocolados] = useState<Record<string, DocumentoJaProtocolado>>({});
  useEffect(() => {
    getDocumentosJaProtocolados(caseId).then(setJaProtocolados);
  }, [caseId]);

  const disponiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...attachments]
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [attachments, search]);

  const selectedAttachments = useMemo(
    () => selected.map((id) => attachments.find((a) => a.id === id)).filter((a): a is AttachmentOption => Boolean(a)),
    [selected, attachments]
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function aplicarSugestoes() {
    setSelected((s) => [...s, ...sugeridosPendentes]);
  }

  function move(id: string, dir: -1 | 1) {
    setSelected((s) => {
      const idx = s.indexOf(id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= s.length) return s;
      const copy = [...s];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  }

  async function handleConfirm() {
    if (!lote && !titulo.trim()) {
      setError("Dê um título ao protocolo.");
      return;
    }
    if (selected.length === 0) {
      setError("Selecione ao menos um documento.");
      return;
    }
    setLoading(true);
    setError("");
    const res = lote
      ? await updateProtocoloLoteItens({ loteId: lote.id, attachmentIds: selected })
      : await createProtocoloLote({ caseId, titulo: titulo.trim(), attachmentIds: selected });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    // "cheio": a lista de documentos disponíveis e a lista de ordem de envio se beneficiam de
    // mais altura/largura visível ao mesmo tempo — daí as duas colunas a partir de md, em vez de
    // empilhar tudo numa coluna estreita.
    <ModalShell size="cheio" title={lote ? "Editar seleção" : "Novo protocolo"} onClose={onClose}>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
          <div className="space-y-3">
            {!lote && (
              <div>
                <label className="text-xs font-medium text-tx-2">Título do protocolo</label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Petição Inicial + documentos"
                  className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
                />
              </div>
            )}

            {selectedAttachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-1.5">
                  Ordem de envio ({selectedAttachments.length})
                </p>
                <div className="border border-regua divide-y divide-regua">
                  {selectedAttachments.map((a, idx) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-tx-2 w-6 tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="flex-1 min-w-0 truncate text-tx">{a.name}</span>
                      <div className="flex items-center shrink-0">
                        <button onClick={() => move(a.id, -1)} disabled={idx === 0} className="p-1 text-tx-2 hover:text-tx disabled:opacity-20">
                          <ChevronUp size={14} />
                        </button>
                        <button onClick={() => move(a.id, 1)} disabled={idx === selectedAttachments.length - 1} className="p-1 text-tx-2 hover:text-tx disabled:opacity-20">
                          <ChevronDown size={14} />
                        </button>
                        <button onClick={() => toggle(a.id)} className="p-1 text-tx-2 hover:text-atencao">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs font-medium text-urgente">{error}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">Documentos do processo</p>
              {sugeridosPendentes.length > 0 && (
                <button
                  onClick={aplicarSugestoes}
                  title={sugestao?.motivo}
                  className="flex items-center gap-1 text-[11px] font-semibold text-marca-tx hover:underline shrink-0"
                >
                  <Sparkles size={11} /> Usar sugestão ({sugeridosPendentes.length})
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome"
                className="w-full text-xs border border-regua pl-7 pr-2.5 py-1.5 bg-sf text-tx"
              />
            </div>
            <div className="border border-regua divide-y divide-regua max-h-[50vh] overflow-y-auto scrollbar-thin">
              {disponiveis.length === 0 && <p className="px-3 py-3 text-xs text-tx-2">Nenhum documento encontrado.</p>}
              {disponiveis.map((a) => {
                const checked = selected.includes(a.id);
                const Icon = getDocumentTypeIcon(a.docType);
                const jaProtocolado = jaProtocolados[a.id];
                return (
                  <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-sf-apoio">
                    <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="h-4 w-4 rounded border-regua-forte text-acao focus:ring-acao/40 shrink-0" />
                    <Icon size={14} className="text-tx-2 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-tx">{a.name}</span>
                    {!checked && sugeridosSet.has(a.id) && (
                      <span title={sugestao?.motivo} className="flex items-center gap-0.5 text-[10px] font-semibold text-marca-tx shrink-0">
                        <Sparkles size={10} /> sugerido
                      </span>
                    )}
                    {jaProtocolado && (
                      <span
                        title={`Já protocolado em "${jaProtocolado.loteTitulo}"${jaProtocolado.numeroProtocolo ? ` (nº ${jaProtocolado.numeroProtocolo})` : ""}`}
                        className="flex items-center gap-0.5 text-[10px] font-semibold text-aviso shrink-0"
                      >
                        <AlertTriangle size={10} /> já protocolado
                      </span>
                    )}
                    <span className="text-[10px] text-tx-2 font-mono shrink-0">{getDocumentTypeLabel(a.docType)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-regua bg-sf-apoio/60">
        <button onClick={onClose} className="text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2">
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          {loading ? "Salvando..." : lote ? "Salvar seleção" : "Criar lote e gerar pasta"}
        </button>
      </div>
    </ModalShell>
  );
}

function RegistrarModal({ caseId, lote, onClose }: { caseId: string; lote: Lote; onClose: () => void }) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!numero.trim() || !data) {
      setError("Informe o número e a data do protocolo.");
      return;
    }
    setLoading(true);
    setError("");

    let comprovanteAttachmentId: string | undefined;
    if (stagedFile) {
      try {
        const blob = await upload(stagedFile.name, stagedFile, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });
        const uploadResult = await finalizeAttachmentUpload({
          blobUrl: blob.url,
          name: stagedFile.name,
          contentType: stagedFile.type || "application/octet-stream",
          docType: "COMPROVANTE_PROTOCOLO",
          caseId,
        });
        if (uploadResult.error || !uploadResult.id) {
          setLoading(false);
          setError(uploadResult.error || "Erro ao enviar o comprovante.");
          return;
        }
        comprovanteAttachmentId = uploadResult.id;
      } catch {
        setLoading(false);
        setError("Erro ao enviar o comprovante. Verifique sua conexão.");
        return;
      }
    }

    const res = await registrarProtocolo({ loteId: lote.id, numeroProtocolo: numero.trim(), protocoladoEm: data, comprovanteAttachmentId });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
      <div className="bg-sf shadow-modal w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
          <h3 className="font-bold text-tx">Registrar protocolo</h3>
          <button onClick={onClose} className="text-tx-2 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-tx-2">&ldquo;{lote.titulo}&rdquo; — depois de enviar pelo sistema do tribunal/órgão.</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-tx-2">Número do protocolo</label>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="20260731-993217"
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-tx-2">Data do protocolo</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-tx-2 block mb-1">Comprovante (opcional)</label>
            {stagedFile ? (
              <div className="flex items-center gap-2 border border-regua px-3 py-2 text-sm bg-sf-apoio">
                <span className="flex-1 min-w-0 truncate text-tx">{stagedFile.name}</span>
                <button onClick={() => setStagedFile(null)} className="text-tx-2 hover:text-atencao shrink-0">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-regua hover:border-acao/40 py-3 text-xs text-tx-2"
              >
                Anexar comprovante devolvido pelo tribunal/órgão
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setStagedFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {error && <p className="text-xs font-medium text-urgente">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-regua">
          <button onClick={onClose} className="text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2">
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {loading ? "Registrando..." : "Concluir protocolo"}
          </button>
        </div>
      </div>
    </div>
  );
}
