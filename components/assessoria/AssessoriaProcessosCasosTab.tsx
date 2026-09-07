"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setCaseAssessoria, createParecer, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { processNumberIncludes } from "@/lib/processNumber";
import { Badge, formatDate } from "@/components/ui";
import { Plus, Search, ExternalLink, Link2, X, ChevronRight, ArrowRight } from "lucide-react";
import { EnviarDocumentosButton, HistoricoEnvios, type Envio } from "@/components/DocumentoEnvios";
import ParecerCard from "@/components/assessoria/ParecerCard";
import ParecerSoltoRow from "@/components/assessoria/ParecerSoltoRow";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";
import { SORT_OPTIONS_SEM_TIPO, sortByOption, type SortOption } from "@/lib/attachmentControls";
import CaseQuickViewButton from "@/components/CaseQuickViewButton";
import SlideDrawer from "@/components/motion/SlideDrawer";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";
import { stageLabels } from "@/lib/funil";

const attendanceStatusColors: Record<string, "green" | "slate" | "bordo" | "amber" | "blue"> = {
  NOVO: "blue",
  EM_TRIAGEM: "amber",
  CONVERTIDO: "green",
  ARQUIVADO: "slate",
  RASCUNHO: "slate",
};
const channelLabels: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  TELEFONE: "Telefone",
  PRESENCIAL: "Presencial",
};

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;
type CaseOption = { id: string; title: string; processNumber: string | null };

const caseStatusColors: Record<string, "green" | "slate" | "bordo" | "amber"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "slate",
};
const caseStatusLabels: Record<string, string> = { ATIVO: "Ativo", SUSPENSO: "Suspenso", ENCERRADO: "Encerrado", ARQUIVADO: "Arquivado" };

export default function AssessoriaProcessosCasosTab({
  assessoria,
  availableCases,
  driveConnected,
  storageMessage,
}: {
  assessoria: Assessoria;
  availableCases: CaseOption[];
  driveConnected: boolean;
  storageMessage?: string;
}) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [linkedThisSession, setLinkedThisSession] = useState<string[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Ordenação da lista de demandas — mesma máquina de ordenar da aba Documentos
  // (lib/attachmentControls.ts), então os dois lugares oferecem os mesmos critérios com os mesmos
  // rótulos. "Mais recente primeiro" é o padrão: demanda nova é a que se procura no dia a dia.
  const [demandaSort, setDemandaSort] = useState<SortOption>("recent");

  const [parecerFormOpen, setParecerFormOpen] = useState(false);
  const [parecerError, setParecerError] = useState<string | null>(null);
  const [parecerPending, startParecerTransition] = useTransition();

  // Ficha rápida de um "Caso vinculado" (Atendimento) — mesmo modelo de card + gaveta suspensa da
  // aba Licitações, usando campos já carregados por getAssessoriaDetail (sem action nova).
  const [openAttendanceId, setOpenAttendanceId] = useState<string | null>(null);
  const openAttendance = assessoria.linkedAttendances.find((a) => a.id === openAttendanceId) || null;

  // Pareceres antigos, cadastrados ANTES de Parecer virar pasta (docType="PARECER" com um único
  // arquivo, ver migração no schema): continuam com parecerId nulo até o backfill rodar (ver
  // scripts/backfill-pareceres.ts) — listados soltos, sem sumir da tela, exatamente como estavam
  // antes desta entrega.
  const pareceresSoltos = assessoria.documents.filter((d) => d.docType === "PARECER" && !d.parecerId);

  // Botão "Enviar E-mail/WhatsApp" desta aba deixa escolher entre TODOS os documentos da
  // assessoria (não só os pareceres) — a pessoa pode querer mandar um contrato, uma notificação
  // extrajudicial etc.
  const todosDocumentos = assessoria.documents.map((d) => ({ id: d.id, name: d.name, docType: d.docType, driveUrl: d.driveUrl }));
  const envios: Envio[] = assessoria.documentoEnvios.map((e) => ({
    id: e.id,
    metodo: e.metodo,
    destinatarioNome: e.destinatarioNome,
    destinatarioContato: e.destinatarioContato,
    enviadoEm: new Date(e.enviadoEm).toISOString(),
    enviadoPor: e.enviadoPor ? { name: e.enviadoPor.name } : null,
    itens: e.itens.map((i) => ({
      id: i.id,
      attachmentId: i.attachmentId,
      assessoriaDocumentoId: i.assessoriaDocumentoId,
      nomeSnapshot: i.nomeSnapshot,
      docTypeSnapshot: i.docTypeSnapshot,
    })),
  }));

  // Parecer virou uma PASTA de documentos (ver model Parecer, prisma/schema.prisma): este
  // formulário só cria o agrupador (nome + data + descrição opcional) e a pasta correspondente no
  // armazenamento — os documentos entram depois, um a um, dentro de cada linha (ver
  // components/assessoria/ParecerFolderRow.tsx), cada um com sua própria categoria.
  function handleCreateParecer(formData: FormData) {
    setParecerError(null);
    startParecerTransition(async () => {
      const result = await createParecer(assessoria.id, {
        name: String(formData.get("name") || ""),
        date: String(formData.get("date") || ""),
        description: String(formData.get("description") || ""),
      });
      if (result.error) setParecerError(result.error);
      else {
        setParecerFormOpen(false);
        router.refresh();
      }
    });
  }

  // availableCases já vem sem os processos vinculados (ver app/(app)/assessoria/[id]/page.tsx),
  // mas linkedThisSession cobre o intervalo entre "acabei de vincular" e o próximo refresh do
  // server component — sem isso o processo continuaria aparecendo na busca até a página recarregar.
  const filteredCases = useMemo(() => {
    const q = query.trim();
    const qLower = q.toLowerCase();
    return availableCases
      .filter((c) => !linkedThisSession.includes(c.id))
      .filter((c) => !q || c.title.toLowerCase().includes(qLower) || processNumberIncludes(c.processNumber, q));
  }, [availableCases, query, linkedThisSession]);

  function handleLinkFromSearch(caseId: string) {
    setError(null);
    setLinkingId(caseId);
    startTransition(async () => {
      const result = await setCaseAssessoria(caseId, assessoria.id);
      setLinkingId(null);
      if (result.error) setError(result.error);
      else {
        setLinkedThisSession((ids) => [...ids, caseId]);
        router.refresh();
      }
    });
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setError(null);
  }

  const pareceresOrdenados = useMemo(
    () =>
      sortByOption(assessoria.pareceres, demandaSort, {
        dateKey: (p) => new Date(p.date).toISOString(),
        name: (p) => p.name,
        typeLabel: () => "",
      }),
    [assessoria.pareceres, demandaSort]
  );

  // Os pareceres legados (sem pasta) seguem o MESMO critério — seria confuso a lista de cima
  // reordenar e a de baixo, que é a continuação dela, ficar parada.
  const pareceresSoltosOrdenados = useMemo(
    () =>
      sortByOption(pareceresSoltos, demandaSort, {
        dateKey: (d) => new Date(d.date).toISOString(),
        name: (d) => d.name,
        typeLabel: () => "",
      }),
    [pareceresSoltos, demandaSort]
  );

  return (
    <div className="space-y-5">
      <div className="bg-sf border border-regua p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Demandas</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {(assessoria.pareceres.length > 0 || pareceresSoltos.length > 0) && (
              <label className="flex items-center gap-1.5 text-[11px] text-tx-2">
                Ordenar
                <select
                  value={demandaSort}
                  onChange={(e) => setDemandaSort(e.target.value as SortOption)}
                  className="text-[11px] border border-regua bg-sf text-tx px-1.5 py-1"
                >
                  {SORT_OPTIONS_SEM_TIPO.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <EnviarDocumentosButton entity={{ tipo: "ASSESSORIA", id: assessoria.id, titulo: assessoria.client.name }} attachments={todosDocumentos} />
            <button
              onClick={() => setParecerFormOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1 "
            >
              <Plus size={13} /> Adicionar demanda
            </button>
          </div>
        </div>

        {!driveConnected && (
          <div className="mb-3">
            <StorageDisconnectedNotice message={storageMessage} />
          </div>
        )}

        {parecerFormOpen && (
          <form
            action={handleCreateParecer}
            className="mb-3 p-3 border border-regua bg-sf-apoio space-y-2.5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input name="name" required placeholder="Nome da demanda" className="doc-input" />
              <input name="date" type="date" className="doc-input" />
            </div>
            <textarea name="description" placeholder="Descrição (opcional)" rows={2} className="doc-input" />
            {parecerError && <p className="text-xs text-urgente">{parecerError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={parecerPending}
                className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 disabled:opacity-50"
              >
                {parecerPending ? "Salvando..." : "Criar demanda"}
              </button>
              <button type="button" onClick={() => setParecerFormOpen(false)} className="text-xs font-semibold text-tx-2">
                Cancelar
              </button>
            </div>
            <style>{`.doc-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.3125rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:var(--sf-superficie); color:var(--tx); }`}</style>
          </form>
        )}

        {assessoria.pareceres.length === 0 && pareceresSoltos.length === 0 ? (
          <p className="text-sm text-tx-3">Nenhuma demanda cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {pareceresOrdenados.map((p) => (
              <ParecerCard key={p.id} parecer={p} assessoriaId={assessoria.id} driveConnected={driveConnected} storageMessage={storageMessage} />
            ))}

            {/* Pareceres antigos (um arquivo = um parecer), ainda sem pasta — ver comentário em
                pareceresSoltos acima. Listados soltos, com o mesmo visual de antes desta entrega,
                até o backfill rodar. */}
            {pareceresSoltosOrdenados.map((d) => (
              <ParecerSoltoRow key={d.id} documento={d} />
            ))}
          </div>
        )}

        <HistoricoEnvios entity={{ tipo: "ASSESSORIA", id: assessoria.id, titulo: assessoria.client.name }} envios={envios} />
      </div>

      <div className="bg-sf border border-regua p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Processos vinculados</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1 "
            >
              <Search size={13} /> Pesquisar processos
            </button>
            <Link
              href={`/processos/novo?assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1 "
            >
              <Plus size={13} /> Novo processo
            </Link>
            <Link
              href={`/processos/novo?type=EXTRAJUDICIAL&assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1 "
            >
              <Plus size={13} /> Novo caso
            </Link>
          </div>
        </div>

        {assessoria.linkedCases.length === 0 ? (
          <p className="text-sm text-tx-3">Nenhum processo vinculado a esta empresa ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assessoria.linkedCases.map((c) => (
              <CaseQuickViewButton
                key={c.id}
                caseId={c.id}
                caseTitle={c.title}
                // Mesma largura da gaveta de Licitações (ver AssessoriaLicitacoesTab.tsx) —
                // pedido explícito para toda a aba "Demandas, Processos e Casos".
                widthClassName="w-[92vw] sm:w-[980px]"
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className="w-full text-left border border-regua rounded-lg bg-sf p-3.5 hover:border-regua-forte transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-tx text-[14px] truncate">{c.title}</p>
                      <ChevronRight size={16} className="text-tx-3 shrink-0 mt-0.5" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2">
                      <div>
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Número</p>
                        <p className="text-[12.5px] text-tx truncate">{c.processNumber || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Atualizado em</p>
                        <p className="text-[12.5px] text-tx tabular-nums">{formatDate(c.updatedAt)}</p>
                      </div>
                      <div>
                        <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Status</p>
                        <Badge color={caseStatusColors[c.status] || "slate"}>{caseStatusLabels[c.status] || c.status}</Badge>
                      </div>
                    </div>
                  </button>
                )}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-sf border border-regua p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2">Casos vinculados</h4>
          {/* Abre o modal "Novo Atendimento" (components/NewAttendanceModal.tsx) já aberto
              (?novo=1), com esta assessoria pré-selecionada (?assessoriaId=...). O rótulo é "Novo
              caso" de propósito (o termo do dia a dia) — continua criando um Atendimento por
              baixo, que depois pode virar um Processo/Caso de verdade. */}
          <Link
            href={`/atendimento?novo=1&assessoriaId=${assessoria.id}`}
            className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1 "
          >
            <Plus size={13} /> Novo caso
          </Link>
        </div>
        {assessoria.linkedAttendances.length === 0 ? (
          <p className="text-sm text-tx-3">Nenhum atendimento vinculado a esta assessoria ainda.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assessoria.linkedAttendances.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenAttendanceId(a.id)}
                className="w-full text-left border border-regua rounded-lg bg-sf p-3.5 hover:border-regua-forte transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-tx text-[14px] truncate">{a.subject}</p>
                  <ChevronRight size={16} className="text-tx-3 shrink-0 mt-0.5" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-2">
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Área</p>
                    <p className="text-[12.5px] text-tx truncate">{a.area || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Canal</p>
                    <p className="text-[12.5px] text-tx truncate">{channelLabels[a.channel] || a.channel}</p>
                  </div>
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Criado em</p>
                    <p className="text-[12.5px] text-tx tabular-nums">{formatDate(a.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-tx-3 mb-1">Status</p>
                    <Badge color={attendanceStatusColors[a.status] || "slate"}>{attendanceStatusLabels[a.status] || a.status}</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf shadow-modal w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua shrink-0">
              <h3 className="font-bold text-tx">Pesquisar processos</h3>
              <button onClick={closeSearch} className="text-tx-3 hover:text-tx">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-regua shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por título ou número do processo"
                  className="w-full text-sm border border-regua-forte bg-sf text-tx pl-8 pr-3 py-2"
                />
              </div>
              {error && <p className="text-xs text-urgente mt-2">{error}</p>}
            </div>

            <div className="overflow-y-auto scrollbar-thin flex-1 divide-y divide-regua">
              {filteredCases.length === 0 ? (
                <p className="text-sm text-tx-3 text-center py-8 px-5">
                  {availableCases.length === 0 ? "Não há processos disponíveis para vincular." : "Nenhum processo encontrado."}
                </p>
              ) : (
                filteredCases.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-tx truncate">{c.title}</p>
                      {c.processNumber && <p className="text-xs text-tx-2">{c.processNumber}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`/processos/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-tx px-2 py-1.5 hover:bg-sf-apoio"
                      >
                        <ExternalLink size={12} /> Abrir
                      </a>
                      <button
                        onClick={() => handleLinkFromSearch(c.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1.5 disabled:opacity-50"
                      >
                        <Link2 size={12} /> {pending && linkingId === c.id ? "Vinculando..." : "Vincular"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {openAttendance && (
        <SlideDrawer
          title={openAttendance.subject}
          subtitle={formatDate(openAttendance.createdAt)}
          onClose={() => setOpenAttendanceId(null)}
          // Mesma largura da gaveta de Licitações — pedido explícito para toda a aba "Demandas,
          // Processos e Casos".
          widthClassName="w-[92vw] sm:w-[980px]"
        >
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge color={attendanceStatusColors[openAttendance.status] || "slate"}>{attendanceStatusLabels[openAttendance.status] || openAttendance.status}</Badge>
              <Badge color="slate">{stageLabels[openAttendance.stage] || openAttendance.stage}</Badge>
            </div>
            <Field label="Cliente/contato">{openAttendance.clientName}</Field>
            {openAttendance.area && <Field label="Área">{openAttendance.area}</Field>}
            <Field label="Canal">{channelLabels[openAttendance.channel] || openAttendance.channel}</Field>
            {openAttendance.description && <Field label="Descrição">{openAttendance.description}</Field>}
            <div className="pt-2 mt-1 border-t border-regua">
              <Link
                href={`/atendimento/${openAttendance.id}`}
                className="flex items-center justify-center gap-1.5 text-sm font-semibold text-acao hover:underline py-1"
              >
                Abrir atendimento completo <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </SlideDrawer>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-tx-3 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-tx mt-0.5 whitespace-pre-wrap">{children}</p>
    </div>
  );
}
