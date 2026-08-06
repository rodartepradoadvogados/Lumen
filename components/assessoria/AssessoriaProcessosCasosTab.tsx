"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setCaseAssessoria, createParecer, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { processNumberIncludes } from "@/lib/processNumber";
import { Badge, formatDate } from "@/components/ui";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import { Plus, Search, ExternalLink, Link2, X, FolderOpen } from "lucide-react";
import { EnviarDocumentosButton, HistoricoEnvios, type Envio } from "@/components/DocumentoEnvios";
import ParecerFolderRow from "@/components/assessoria/ParecerFolderRow";

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
}: {
  assessoria: Assessoria;
  availableCases: CaseOption[];
  driveConnected: boolean;
}) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [linkedThisSession, setLinkedThisSession] = useState<string[]>([]);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [parecerFormOpen, setParecerFormOpen] = useState(false);
  const [parecerError, setParecerError] = useState<string | null>(null);
  const [parecerPending, startParecerTransition] = useTransition();

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

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Pareceres</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <EnviarDocumentosButton entity={{ tipo: "ASSESSORIA", id: assessoria.id, titulo: assessoria.client.name }} attachments={todosDocumentos} />
            <button
              onClick={() => setParecerFormOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg"
            >
              <Plus size={13} /> Adicionar parecer
            </button>
          </div>
        </div>

        {parecerFormOpen && (
          <form
            action={handleCreateParecer}
            className="mb-3 p-3 rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-50 dark:bg-navy-800 space-y-2.5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input name="name" required placeholder="Nome do parecer" className="doc-input" />
              <input name="date" type="date" className="doc-input" />
            </div>
            <textarea name="description" placeholder="Descrição (opcional)" rows={2} className="doc-input" />
            {parecerError && <p className="text-xs text-red-600">{parecerError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={parecerPending}
                className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {parecerPending ? "Salvando..." : "Criar pasta"}
              </button>
              <button type="button" onClick={() => setParecerFormOpen(false)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
                Cancelar
              </button>
            </div>
            <style>{`.doc-input { width:100%; border:1px solid rgba(15,31,61,0.12); border-radius:0.5rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:#fff; } .dark .doc-input { border-color: rgba(255,255,255,0.15); background:#0f1f3d; color:#fbfaf7; }`}</style>
          </form>
        )}

        {assessoria.pareceres.length === 0 && pareceresSoltos.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum parecer cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {assessoria.pareceres.map((p) => (
              <ParecerFolderRow key={p.id} parecer={p} assessoriaId={assessoria.id} driveConnected={driveConnected} />
            ))}

            {/* Pareceres antigos (um arquivo = um parecer), ainda sem pasta — ver comentário em
                pareceresSoltos acima. Listados soltos, com o mesmo visual de antes desta entrega,
                até o backfill rodar. */}
            {pareceresSoltos.map((d) => (
              <a
                key={d.id}
                href={d.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-between items-center gap-3 py-2 px-3 text-sm border border-navy-800/8 dark:border-white/10 rounded-lg hover:bg-cream-50 dark:hover:bg-white/5"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FolderOpen size={14} className="shrink-0 text-navy-800/30 dark:text-cream-50/30" />
                  <span className="font-medium text-navy-900 dark:text-cream-50 truncate">{d.name}</span>
                  <span className="shrink-0 text-[10px] text-navy-800/40 dark:text-cream-50/40 font-mono">{getDocumentTypeLabel(d.docType)}</span>
                </span>
                <span className="text-navy-800/45 dark:text-cream-50/45 whitespace-nowrap text-xs shrink-0">{formatDate(d.date)}</span>
              </a>
            ))}
          </div>
        )}

        <HistoricoEnvios entity={{ tipo: "ASSESSORIA", id: assessoria.id, titulo: assessoria.client.name }} envios={envios} />
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45">Processos vinculados</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg"
            >
              <Search size={13} /> Pesquisar processos
            </button>
            <Link
              href={`/processos/novo?assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg"
            >
              <Plus size={13} /> Novo processo
            </Link>
            <Link
              href={`/processos/novo?type=EXTRAJUDICIAL&assessoriaId=${assessoria.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1 rounded-lg"
            >
              <Plus size={13} /> Novo caso
            </Link>
          </div>
        </div>

        {assessoria.linkedCases.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum processo vinculado a esta empresa ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedCases.map((c) => (
              <Link
                key={c.id}
                href={`/processos/${c.id}`}
                className="flex justify-between gap-3 py-2 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
              >
                <span className="font-medium text-navy-900 dark:text-cream-50 underline decoration-navy-900/20 dark:decoration-cream-50/20">{c.title}</span>
                <Badge color={caseStatusColors[c.status] || "slate"}>{caseStatusLabels[c.status] || c.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-navy-900 rounded-lg border border-slate-200 dark:border-white/10 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 mb-2.5">Casos (atendimentos) vinculados</h4>
        {assessoria.linkedAttendances.length === 0 ? (
          <p className="text-sm text-navy-800/40 dark:text-cream-50/40">Nenhum atendimento vinculado a esta assessoria ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {assessoria.linkedAttendances.map((a) => (
              <Link
                key={a.id}
                href={`/atendimento/${a.id}`}
                className="flex justify-between gap-3 py-2 text-sm hover:bg-cream-50 dark:hover:bg-white/5 -mx-1 px-1 rounded"
              >
                <span className="font-medium text-navy-900 dark:text-cream-50 underline decoration-navy-900/20 dark:decoration-cream-50/20 truncate">{a.subject}</span>
                <span className="text-navy-800/45 dark:text-cream-50/45 whitespace-nowrap">{formatDate(a.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Pesquisar processos</h3>
              <button onClick={closeSearch} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 border-b border-navy-800/8 dark:border-white/10 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por título ou número do processo"
                  className="w-full text-sm border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-lg pl-8 pr-3 py-2"
                />
              </div>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>

            <div className="overflow-y-auto scrollbar-thin flex-1 divide-y divide-navy-800/5 dark:divide-white/10">
              {filteredCases.length === 0 ? (
                <p className="text-sm text-navy-800/40 dark:text-cream-50/40 text-center py-8 px-5">
                  {availableCases.length === 0 ? "Não há processos disponíveis para vincular." : "Nenhum processo encontrado."}
                </p>
              ) : (
                filteredCases.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{c.title}</p>
                      {c.processNumber && <p className="text-xs text-navy-800/45 dark:text-cream-50/45">{c.processNumber}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={`/processos/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 px-2 py-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-white/5"
                      >
                        <ExternalLink size={12} /> Abrir
                      </a>
                      <button
                        onClick={() => handleLinkFromSearch(c.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-800 dark:text-gold-400 bg-gold-500/10 hover:bg-gold-500/20 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
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
    </div>
  );
}
