"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { X, ExternalLink, UploadCloud, Link as LinkIcon, Search, Pencil, LayoutGrid, List as ListIcon, Table2 } from "lucide-react";
import { createAttachment, deleteAttachment, finalizeAttachmentUpload, updateAttachmentDocType } from "@/lib/actions/attachments";
import { getDocumentTypeIcon, getDocumentTypeLabel, getLinkSourceLabel, isRecursoQueEscalaInstancia } from "@/lib/documentTypes";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { formatDate } from "@/components/ui";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import RecursoEscalaPrompt from "@/components/processo/RecursoEscalaPrompt";
import { type SortOption, SORT_OPTIONS, sortByOption, useViewModePreference } from "@/lib/attachmentControls";

// Mesma convenção de chave de outras preferências client-side do site (ver THEME_KEY em
// lib/theme.ts) — guarda só o modo de visualização escolhido, não afeta nada no banco. Chave
// preservada tal e qual (não mexer) para não perder a preferência já salva no navegador de quem
// já usa esta tela — ver lib/attachmentControls.ts para o hook compartilhado com a aba Documentos
// da Assessoria.
const VIEW_MODE_KEY = "rp-attachment-view";

type AttachmentData = {
  id: string;
  name: string;
  driveUrl: string;
  docType: string;
  createdAt: string;
  uploadedBy: { name: string } | null;
};

export default function AttachmentList({
  attachments,
  caseId,
  attendanceId,
  driveConnected,
  tribunais = [],
}: {
  attachments: AttachmentData[];
  caseId?: string;
  attendanceId?: string;
  driveConnected: boolean;
  // Catálogo de tribunais para o pop-up "vincular a tribunal superior?" (ver
  // components/processo/RecursoEscalaPrompt.tsx) — só faz sentido para anexo de Processo
  // (attendanceId nunca dispara o pop-up, mesmo que venha preenchido).
  tribunais?: TribunalCatalogEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // docType do último anexo/edição que é um recurso que escala instância — dispara o pop-up (ver
  // RecursoEscalaPrompt.tsx) só quando caseId existe (Atendimento não tem esse conceito).
  const [recursoPrompt, setRecursoPrompt] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkDocType, setLinkDocType] = useState("OUTRO");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedName, setStagedName] = useState("");
  const [stagedDocType, setStagedDocType] = useState("OUTRO");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [viewMode, changeViewMode] = useViewModePreference(VIEW_MODE_KEY);

  // "Parecer" só faz sentido como anexo de Processo — Atendimento não tem esse conceito.
  const excludeParecer = !caseId ? ["PARECER"] : undefined;

  const filtered = useMemo(() => {
    return attachments.filter((a) => {
      if (search.trim() && !a.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (typeFilter !== "TODOS" && a.docType !== typeFilter) return false;
      const day = a.createdAt.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [attachments, search, typeFilter, dateFrom, dateTo]);

  const sorted = useMemo(
    () =>
      sortByOption(filtered, sortBy, {
        dateKey: (a) => a.createdAt,
        name: (a) => a.name,
        typeLabel: (a) => getDocumentTypeLabel(a.docType),
      }),
    [filtered, sortBy]
  );

  function stageFile(file: File) {
    setError(null);
    setStagedFile(file);
    setStagedName(file.name);
    setStagedDocType("OUTRO");
  }

  async function confirmStagedFile() {
    if (!stagedFile) return;
    setError(null);
    setUploading(true);

    try {
      // Etapa 1: sobe o arquivo direto do navegador pro Vercel Blob, sem passar pela nossa
      // function — uma Serverless Function tem um limite de corpo bem menor que os 25MB que
      // anexos como "processo completo" em PDF costumam ter (é isso que causava "Erro ao
      // enviar arquivo. Verifique sua conexão." antes, mesmo com conexão boa).
      const blob = await upload(stagedFile.name, stagedFile, {
        access: "public",
        handleUploadUrl: "/api/attachments/blob-token",
      });

      // Etapa 2: payload pequeno (só a URL do Blob + metadados) — o servidor baixa o
      // conteúdo, manda pro Drive e apaga o Blob temporário.
      const result = await finalizeAttachmentUpload({
        blobUrl: blob.url,
        name: stagedName.trim() || stagedFile.name,
        contentType: stagedFile.type || "application/octet-stream",
        docType: stagedDocType,
        caseId,
        attendanceId,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setStagedFile(null);
        if (caseId && isRecursoQueEscalaInstancia(stagedDocType)) setRecursoPrompt(stagedDocType);
        router.refresh();
      }
    } catch (e) {
      // Mostra a causa real (ex.: erro do próprio Vercel Blob, token expirado, tipo de arquivo
      // rejeitado) em vez de um texto genérico — sem isso não dá para diferenciar problema de
      // rede de uma falha específica do upload.
      setError(e instanceof Error ? `Erro ao enviar arquivo: ${e.message}` : "Erro ao enviar arquivo. Verifique sua conexão.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  function handleAddLink(formData: FormData) {
    startTransition(async () => {
      const result = await createAttachment({
        name: String(formData.get("name")),
        driveUrl: String(formData.get("driveUrl")),
        docType: linkDocType,
        caseId,
        attendanceId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinkMode(false);
      if (caseId && isRecursoQueEscalaInstancia(linkDocType)) setRecursoPrompt(linkDocType);
      setLinkDocType("OUTRO");
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Excluir este anexo? O arquivo também será apagado do Drive.")) return;
    startTransition(async () => {
      const res = await deleteAttachment(id);

      // O anexo faz parte de um protocolo já concluído: a action não excluiu nada ainda e
      // devolveu quais protocolos seriam afetados, pra confirmação em cima do fato concreto
      // (ver deleteAttachment em lib/actions/attachments.ts).
      if (res.precisaConfirmar) {
        const lista = (res.protocolos ?? []).map((p) => `• ${p}`).join("\n");
        const confirmado = window.confirm(
          `Este documento faz parte de protocolo já concluído:\n\n${lista}\n\n` +
            "O protocolo continua no histórico com o nome do documento, mas o arquivo deixa de existir e o link para de abrir.\n\nExcluir mesmo assim?"
        );
        if (!confirmado) return;
        const forcado = await deleteAttachment(id, { confirmarProtocolado: true });
        if (forcado.error) {
          setError(forcado.error);
          return;
        }
        router.refresh();
        return;
      }

      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleUpdateDocType(id: string, docType: string) {
    startTransition(async () => {
      await updateAttachmentDocType(id, docType);
      setEditingId(null);
      if (caseId && isRecursoQueEscalaInstancia(docType)) setRecursoPrompt(docType);
      router.refresh();
    });
  }

  return (
    <div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome"
              className="w-full text-xs border border-regua bg-sf text-tx rounded-lg pl-7 pr-2.5 py-1.5"
            />
          </div>
          <DocumentTypeSelect
            value={typeFilter}
            onChange={setTypeFilter}
            allowAll
            includeLegacy
            excludeKeys={excludeParecer}
            className="text-xs border border-regua bg-sf text-tx rounded-lg px-2 py-1.5 max-w-[180px]"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Enviado a partir de"
            className="text-xs border border-regua bg-sf text-tx rounded-lg px-2 py-1.5"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Enviado até"
            className="text-xs border border-regua bg-sf text-tx rounded-lg px-2 py-1.5"
          />
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <label className="flex items-center gap-1.5 text-xs text-tx-2">
            Ordenar por
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs border border-regua bg-sf text-tx rounded-lg px-2 py-1.5"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-0.5 border border-regua rounded-lg p-0.5">
            {(
              [
                { mode: "icons" as const, icon: LayoutGrid, label: "Ícones" },
                { mode: "list" as const, icon: ListIcon, label: "Lista" },
                { mode: "details" as const, icon: Table2, label: "Detalhes" },
              ]
            ).map(({ mode, icon: ModeIcon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeViewMode(mode)}
                data-tip={label}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                  viewMode === mode
                    ? "bg-acao text-acao-tx"
                    : "text-tx-2 hover:bg-sf-apoio"
                }`}
              >
                <ModeIcon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === "icons" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
          {sorted.map((a) => {
            const Icon = getDocumentTypeIcon(a.docType);
            return (
              <div
                key={a.id}
                className="group relative bg-sf-apoio border border-regua rounded-lg p-3 hover:border-acao/40 transition-colors"
              >
                {editingId === a.id ? (
                  <div className="flex flex-col items-center text-center gap-1.5">
                    <div className="h-10 w-10 rounded-lg bg-sf text-tx-2 flex items-center justify-center">
                      <Icon size={18} />
                    </div>
                    <p className="text-xs font-medium text-tx truncate w-full" title={a.name}>
                      {a.name}
                    </p>
                    <DocumentTypeSelect
                      value={a.docType}
                      onChange={(v) => handleUpdateDocType(a.id, v)}
                      excludeKeys={excludeParecer}
                      className="w-full text-[10px] border border-regua bg-sf text-tx rounded px-1 py-1"
                      allowCreate
                    />
                  </div>
                ) : (
                  <a href={a.driveUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center text-center gap-1.5">
                    <div className="h-10 w-10 rounded-lg bg-sf text-tx-2 flex items-center justify-center">
                      <Icon size={18} />
                    </div>
                    <p className="text-xs font-medium text-tx truncate w-full" title={a.name}>
                      {a.name}
                    </p>
                    <p className="text-[10px] text-tx-2 truncate w-full" title={getDocumentTypeLabel(a.docType)}>
                      {getDocumentTypeLabel(a.docType)}
                    </p>
                    <span className="flex items-center gap-0.5 text-[10px] text-marca-tx">
                      <ExternalLink size={10} /> {getLinkSourceLabel(a.driveUrl)}
                    </span>
                  </a>
                )}
                <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                    disabled={pending}
                    data-tip="Editar tipo de documento"
                    className="p-1 rounded-md text-tx-3 hover:text-marca-tx hover:bg-marca-bg transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={pending}
                    data-tip="Excluir anexo"
                    className="p-1 rounded-md text-tx-3 hover:text-atencao hover:bg-atencao/10 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-xs text-tx-2 col-span-full py-2">
              {attachments.length === 0 ? "Nenhum anexo ainda." : "Nenhum anexo encontrado com esse filtro."}
            </p>
          )}
        </div>
      )}

      {viewMode === "list" && (
        <div className="mb-3 divide-y divide-regua border-y border-regua">
          {sorted.map((a) => {
            const Icon = getDocumentTypeIcon(a.docType);
            return (
              <div key={a.id} className="group flex items-center gap-2 py-1.5">
                <Icon size={14} className="shrink-0 text-tx-2" />
                {editingId === a.id ? (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-tx truncate">{a.name}</span>
                    <DocumentTypeSelect
                      value={a.docType}
                      onChange={(v) => handleUpdateDocType(a.id, v)}
                      excludeKeys={excludeParecer}
                      className="text-[10px] border border-regua bg-sf text-tx rounded px-1.5 py-1 max-w-[180px]"
                      allowCreate
                    />
                  </div>
                ) : (
                  <a href={a.driveUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center gap-2 min-w-0 hover:text-marca-tx">
                    <span className="text-xs font-medium text-tx truncate" title={a.name}>
                      {a.name}
                    </span>
                    <span className="hidden sm:inline text-[10px] text-tx-2 shrink-0">
                      {getDocumentTypeLabel(a.docType)}
                    </span>
                  </a>
                )}
                <span className="shrink-0 text-[10px] text-tx-2">{formatDate(a.createdAt)}</span>
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                    disabled={pending}
                    data-tip="Editar tipo de documento"
                    className="p-1 rounded-md text-tx-3 hover:text-marca-tx hover:bg-marca-bg transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={pending}
                    data-tip="Excluir anexo"
                    className="p-1 rounded-md text-tx-3 hover:text-atencao hover:bg-atencao/10 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-xs text-tx-2 py-2">
              {attachments.length === 0 ? "Nenhum anexo ainda." : "Nenhum anexo encontrado com esse filtro."}
            </p>
          )}
        </div>
      )}

      {viewMode === "details" && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-tx-2 border-b border-regua">
                <th className="pb-2 pr-3">Nome</th>
                <th className="pb-2 pr-3">Tipo</th>
                <th className="pb-2 pr-3">Enviado em</th>
                <th className="pb-2 pr-3">Enviado por</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {sorted.map((a) => (
                <tr key={a.id} className="group">
                  <td className="py-2 pr-3">
                    <a
                      href={a.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-marca-tx hover:underline"
                      title={a.driveUrl}
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      {a.name}
                    </a>
                  </td>
                  <td className="py-2 pr-3 text-tx-2">
                    {editingId === a.id ? (
                      <DocumentTypeSelect
                        value={a.docType}
                        onChange={(v) => handleUpdateDocType(a.id, v)}
                        excludeKeys={excludeParecer}
                        className="text-[10px] border border-regua bg-sf text-tx rounded px-1.5 py-1"
                        allowCreate
                      />
                    ) : (
                      getDocumentTypeLabel(a.docType)
                    )}
                  </td>
                  <td className="py-2 pr-3 text-tx-2 whitespace-nowrap">{formatDate(a.createdAt)}</td>
                  <td className="py-2 pr-3 text-tx-2">{a.uploadedBy?.name || "—"}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => setEditingId(editingId === a.id ? null : a.id)}
                        disabled={pending}
                        data-tip="Editar tipo de documento"
                        className="p-1 rounded-md text-tx-3 hover:text-marca-tx hover:bg-marca-bg transition-colors"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={pending}
                        data-tip="Excluir anexo"
                        className="p-1 rounded-md text-tx-3 hover:text-atencao hover:bg-atencao/10 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <p className="text-xs text-tx-2 py-2">
              {attachments.length === 0 ? "Nenhum anexo ainda." : "Nenhum anexo encontrado com esse filtro."}
            </p>
          )}
        </div>
      )}

      {!driveConnected && (
        <p className="text-[11px] text-aviso bg-aviso-bg border border-aviso/25 rounded-lg px-2.5 py-1.5 mb-2">
          Drive ainda não conectado. Peça a um administrador para conectar em Configurações, ou cole um link manualmente abaixo.
        </p>
      )}

      {driveConnected && !stagedFile && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
            dragOver ? "border-acao bg-acao-bg" : "border-regua hover:border-acao/40 hover:bg-sf-apoio"
          }`}
        >
          <UploadCloud size={20} className="text-tx-2" />
          <p className="text-xs text-tx-2 text-center">
            Arraste um arquivo aqui, ou clique para selecionar do computador
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) stageFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {stagedFile && (
        <div className="p-3 rounded-lg bg-sf-apoio border border-regua space-y-2">
          <p className="text-xs font-semibold text-tx-2">Esse documento é:</p>
          <input
            value={stagedName}
            onChange={(e) => setStagedName(e.target.value)}
            placeholder="Nome do documento"
            className="w-full text-sm border border-regua bg-sf text-tx rounded-lg px-2.5 py-1.5"
          />
          <DocumentTypeSelect
            value={stagedDocType}
            onChange={setStagedDocType}
            excludeKeys={excludeParecer}
            className="w-full text-sm border border-regua bg-sf text-tx rounded-lg px-2.5 py-1.5"
            allowCreate
          />
          <div className="flex gap-2">
            <button
              onClick={confirmStagedFile}
              disabled={uploading}
              className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50"
            >
              {uploading ? "Enviando..." : "Enviar para o Drive"}
            </button>
            <button
              onClick={() => setStagedFile(null)}
              disabled={uploading}
              className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-urgente bg-urgente-bg border border-urgente/25 rounded-lg px-2.5 py-1.5 mt-2">
          {error}
        </p>
      )}

      <div className="mt-2">
        {linkMode ? (
          <form action={handleAddLink} className="p-3 rounded-lg bg-sf-apoio border border-regua space-y-2">
            <input
              name="name"
              required
              placeholder="Nome do documento"
              className="w-full text-sm border border-regua bg-sf text-tx rounded-lg px-2.5 py-1.5"
            />
            <input
              name="driveUrl"
              type="url"
              required
              placeholder="Link do Google Drive, Dropbox, OneDrive..."
              className="w-full text-sm border border-regua bg-sf text-tx rounded-lg px-2.5 py-1.5"
            />
            <div>
              <p className="text-xs font-semibold text-tx-2 mb-1">Esse documento é:</p>
              <DocumentTypeSelect
                value={linkDocType}
                onChange={setLinkDocType}
                excludeKeys={excludeParecer}
                className="w-full text-sm border border-regua bg-sf text-tx rounded-lg px-2.5 py-1.5"
            allowCreate
          />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50"
              >
                {pending ? "Salvando..." : "Salvar anexo"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLinkMode(false);
                  setLinkDocType("OUTRO");
                }}
                className="px-3 text-xs font-semibold text-tx-2 hover:text-tx"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setLinkMode(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-2.5 py-1.5 rounded-lg hover:bg-sf-apoio"
          >
            <LinkIcon size={13} /> ou colar um link (Google Drive, Dropbox, OneDrive...)
          </button>
        )}
      </div>

      {recursoPrompt && caseId && (
        <RecursoEscalaPrompt
          caseId={caseId}
          docTypeLabel={getDocumentTypeLabel(recursoPrompt)}
          tribunais={tribunais}
          onClose={() => setRecursoPrompt(null)}
        />
      )}
    </div>
  );
}
