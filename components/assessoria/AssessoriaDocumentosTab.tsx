"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { addDocumento, type getAssessoriaDetail } from "@/lib/actions/assessoria";
import { formatDate } from "@/components/ui";
import { getDocumentTypeIcon, getDocumentTypeLabel, getLinkSourceLabel, isEmpresaDocumentType } from "@/lib/documentTypes";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { Plus, Search, UploadCloud, ExternalLink, FolderOpen, LayoutGrid, List as ListIcon, Table2, Building2 } from "lucide-react";
import { type SortOption, SORT_OPTIONS, sortByOption, useViewModePreference } from "@/lib/attachmentControls";
import { formatoArquivo } from "@/lib/fileExtension";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;

// Preferência de modo de visualização (ícones/lista/detalhes) desta tela, salva à parte da de
// Anexos de Processo/Atendimento (ver VIEW_MODE_KEY em components/AttachmentList.tsx) — trocar o
// modo aqui não deve mudar o que a pessoa vê lá, e vice-versa.
const VIEW_MODE_KEY = "rp-assessoria-documentos-view";

// Etiqueta discreta de pasta de parecer — reaproveitada nos três modos de visualização abaixo.
// Eixo de organização independente da categoria/tipo de documento (ver comentário grande no fim
// do arquivo): mostra a pasta MANUAL a que o documento pertence, quando pertence a alguma.
function ParecerBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium text-tx-2 bg-sf-apoio px-1.5 py-0.5 rounded-full"
      title={`Dentro da demanda "${name}"`}
    >
      <FolderOpen size={10} className="shrink-0" />
      <span className="truncate max-w-[120px]">{name}</span>
    </span>
  );
}

export default function AssessoriaDocumentosTab({
  assessoria,
  driveConnected,
  storageMessage,
}: {
  assessoria: Assessoria;
  driveConnected: boolean;
  storageMessage?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // "TODOS" = sem filtro de pasta; "SOLTOS" = só documentos fora de qualquer pasta de parecer;
  // qualquer outro valor é o id de um Parecer específico (ver assessoria.pareceres).
  const [folderFilter, setFolderFilter] = useState("TODOS");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [viewMode, changeViewMode] = useViewModePreference(VIEW_MODE_KEY);

  const [formOpen, setFormOpen] = useState(false);
  const [linkDocType, setLinkDocType] = useState("OUTRO");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedName, setStagedName] = useState("");
  const [stagedDocType, setStagedDocType] = useState("OUTRO");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return assessoria.documents.filter((d) => {
      if (search.trim() && !d.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (typeFilter !== "TODOS" && d.docType !== typeFilter) return false;
      const day = new Date(d.date).toISOString().slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      // Filtro de pasta — eixo independente da categoria (typeFilter acima): soma aos demais
      // filtros em vez de substituí-los, cada `if` só descarta, nunca reintroduz um documento.
      if (folderFilter === "SOLTOS" && d.parecer) return false;
      if (folderFilter !== "TODOS" && folderFilter !== "SOLTOS" && d.parecer?.id !== folderFilter) return false;
      return true;
    });
  }, [assessoria.documents, search, typeFilter, dateFrom, dateTo, folderFilter]);

  const sorted = useMemo(
    () =>
      sortByOption(filtered, sortBy, {
        dateKey: (d) => new Date(d.date).toISOString(),
        name: (d) => d.name,
        typeLabel: (d) => getDocumentTypeLabel(d.docType),
      }),
    [filtered, sortBy]
  );

  // Recorte por categoria sobre o MESMO catálogo (não uma pasta física à parte) — contrato
  // social, procurações, alterações contratuais, alvarás e afins (ver isEmpresaDocumentType,
  // lib/documentTypes.ts). Documentos já cadastrados com uma dessas categorias entram aqui
  // sozinhos, sem precisar de nenhuma migração; a busca/filtros do catálogo geral acima não
  // afetam esta lista, que é independente.
  const documentosEmpresa = useMemo(
    () => sortByOption(assessoria.documents.filter((d) => isEmpresaDocumentType(d.docType)), "recent", { dateKey: (d) => new Date(d.date).toISOString(), name: (d) => d.name, typeLabel: () => "" }),
    [assessoria.documents]
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addDocumento(assessoria.id, {
        name: String(formData.get("name") || ""),
        docType: String(formData.get("docType") || "OUTRO"),
        driveUrl: String(formData.get("driveUrl") || ""),
        date: String(formData.get("date") || ""),
      });
      if (result.error) setError(result.error);
      else {
        setFormOpen(false);
        setLinkDocType("OUTRO");
      }
    });
  }

  function stageFile(file: File) {
    setError(null);
    setStagedFile(file);
    setStagedName(file.name);
    setStagedDocType("OUTRO");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) stageFile(file);
  }

  async function confirmStagedFile() {
    if (!stagedFile) return;
    setError(null);
    setUploading(true);

    try {
      // Etapa 1: sobe o arquivo direto do navegador pro Vercel Blob (mesmo endpoint de token dos
      // Anexos de processo, ver app/api/attachments/blob-token/route.ts — genérico) — uma Vercel
      // Serverless Function tem limite de payload de entrada bem menor que os documentos que esta
      // tela precisa aceitar (contrato completo em PDF, digitalização de processo, etc.).
      const blob = await upload(stagedFile.name, stagedFile, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });

      // Etapa 2: payload pequeno (só a URL do Blob + metadados) — o servidor baixa o conteúdo,
      // manda pro Drive/OneDrive/Dropbox do escritório e registra o AssessoriaDocumento.
      const res = await fetch("/api/assessoria/documentos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: blob.url,
          name: stagedName.trim() || stagedFile.name,
          contentType: stagedFile.type || "application/octet-stream",
          docType: stagedDocType,
          assessoriaId: assessoria.id,
        }),
      });

      // SEMPRE confere res.ok ANTES de interpretar o corpo como JSON — uma resposta de erro que
      // não vem da nossa rota (413/504, página de erro em HTML) não é JSON válido; tentar
      // `res.json()` primeiro faz cair no texto genérico mesmo quando a causa real é conhecida.
      let data: { error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data?.error || `Erro ao enviar arquivo (HTTP ${res.status}).`);
      } else {
        setStagedFile(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? `Erro ao enviar arquivo: ${e.message}` : "Erro ao enviar arquivo. Verifique sua conexão.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {/* Catálogo da própria empresa — contrato social, procurações, alterações contratuais,
          alvarás e afins (ver isEmpresaDocumentType, lib/documentTypes.ts). Recorte por
          categoria sobre o MESMO catálogo abaixo, não uma pasta física à parte: um documento
          aparece aqui E na lista geral, sem duplicar o cadastro. */}
      <div className="bg-sf border border-regua p-4 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-tx-2 flex items-center gap-1.5">
            <Building2 size={13} /> Documentos da Empresa
          </h4>
          <button
            onClick={() => {
              setLinkDocType("CONTRATO_SOCIAL");
              setFormOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs font-semibold text-acao hover:text-acao-hover px-2.5 py-1 "
          >
            <Plus size={13} /> Adicionar documento da empresa
          </button>
        </div>
        {documentosEmpresa.length === 0 ? (
          <p className="text-sm text-tx-3">
            Nenhum documento da empresa cadastrado ainda — contrato social, procuração, alteração contratual, alvará...
          </p>
        ) : (
          <div className="divide-y divide-regua">
            {documentosEmpresa.map((d) => {
              const Icon = getDocumentTypeIcon(d.docType);
              return (
                <a
                  key={d.id}
                  href={d.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 py-2 hover:bg-sf-apoio -mx-1 px-1 rounded"
                >
                  <Icon size={14} className="shrink-0 text-tx-2" />
                  <span className="text-sm font-medium text-tx truncate" title={d.name}>
                    {d.name}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-tx-2 shrink-0">{getDocumentTypeLabel(d.docType)}</span>
                  <span className="flex-1" />
                  <span className="shrink-0 text-[11px] text-tx-2">{formatDate(d.date)}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome"
              className="w-full text-sm border border-regua bg-sf text-tx pl-7 pr-2.5 py-1.5"
            />
          </div>
          <DocumentTypeSelect
            value={typeFilter}
            onChange={setTypeFilter}
            allowAll
            includeLegacy
            excludeKeys={["PARECER"]}
            className="text-sm border border-regua bg-sf text-tx px-2 py-1.5 max-w-[220px]"
          />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Enviado a partir de"
            className="text-sm border border-regua bg-sf text-tx px-2 py-1.5"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Enviado até"
            className="text-sm border border-regua bg-sf text-tx px-2 py-1.5"
          />
          {/* Filtro por pasta de parecer — eixo independente da categoria (select acima): "Todas
              as pastas" não filtra nada, "Fora de pasta" mostra só documentos soltos, e cada
              parecer cadastrado filtra para os documentos daquela pasta específica. */}
          {assessoria.pareceres.length > 0 && (
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              title="Filtrar por demanda"
              className="text-sm border border-regua bg-sf text-tx px-2 py-1.5 max-w-[200px]"
            >
              <option value="TODOS">Todas as pastas</option>
              <option value="SOLTOS">Fora de pasta</option>
              {assessoria.pareceres.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-acao hover:text-acao-hover hover:bg-sf-apoio px-3 py-1.5 "
        >
          <Plus size={14} /> Colar link
        </button>
      </div>

      {assessoria.documents.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <label className="flex items-center gap-1.5 text-xs text-tx-2">
            Ordenar por
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs border border-regua bg-sf text-tx px-2 py-1.5"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-0.5 border border-regua p-0.5">
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
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 transition-colors ${
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

      {formOpen && (
        <form
          action={handleSubmit}
          className="mb-4 p-4 border border-regua bg-sf-apoio space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="name" required placeholder="Nome do documento" className="doc-input" />
            <DocumentTypeSelect name="docType" value={linkDocType} onChange={setLinkDocType} excludeKeys={["PARECER"]} className="doc-input" allowCreate />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input name="driveUrl" required type="url" placeholder="Link do Drive, Dropbox, OneDrive..." className="doc-input" />
            <input name="date" type="date" className="doc-input" />
          </div>
          {error && <p className="text-xs text-urgente">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 py-2 disabled:opacity-50">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="text-xs font-semibold text-tx-2">
              Cancelar
            </button>
          </div>
          <style>{`.doc-input { width:100%; border:1px solid var(--regua-forte); border-radius:0.3125rem; padding:0.45rem 0.7rem; font-size:0.8rem; background:var(--sf-superficie); color:var(--tx); }`}</style>
        </form>
      )}

      {!driveConnected && (
        <div className="mb-4">
          <StorageDisconnectedNotice message={storageMessage} />
        </div>
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
          className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed p-4 cursor-pointer transition-colors mb-4 ${
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
        <div className="p-3 bg-sf-apoio border border-regua space-y-2 mb-4">
          <p className="text-xs font-semibold text-tx-2">Esse documento é:</p>
          <input
            value={stagedName}
            onChange={(e) => setStagedName(e.target.value)}
            placeholder="Nome do documento"
            className="w-full text-sm border border-regua bg-sf text-tx px-2.5 py-1.5"
          />
          <DocumentTypeSelect
            value={stagedDocType}
            onChange={setStagedDocType}
            excludeKeys={["PARECER"]}
            className="w-full text-sm border border-regua bg-sf text-tx px-2.5 py-1.5"
            allowCreate
          />
          <div className="flex gap-2">
            <button
              onClick={confirmStagedFile}
              disabled={uploading}
              className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold py-1.5 disabled:opacity-50"
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

      {/* Três modos de visualização, mesmo padrão de components/AttachmentList.tsx (ver
          lib/attachmentControls.ts para o que é compartilhado). Aqui NÃO há editar tipo/excluir
          por linha — esta tela nunca teve essas ações, e adicioná-las está fora do escopo desta
          entrega — então o corpo de cada card/linha é próprio desta tela, não veio copiado do
          AttachmentList. */}
      {viewMode === "icons" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {sorted.map((d) => {
            const Icon = getDocumentTypeIcon(d.docType);
            return (
              <a
                key={d.id}
                href={d.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-sf-apoio border border-regua p-3 hover:border-acao/40 transition-colors flex flex-col items-center text-center gap-1.5"
              >
                <div className="h-10 w-10 bg-sf text-tx-2 flex items-center justify-center">
                  <Icon size={18} />
                </div>
                <p className="text-xs font-medium text-tx truncate w-full" title={d.name}>
                  {d.name}
                </p>
                <p className="text-[10px] text-tx-2 truncate w-full" title={getDocumentTypeLabel(d.docType)}>
                  {getDocumentTypeLabel(d.docType)}
                </p>
                {d.parecer && <ParecerBadge name={d.parecer.name} />}
                <span className="flex items-center gap-0.5 text-[10px] text-marca-tx">
                  <ExternalLink size={10} /> {getLinkSourceLabel(d.driveUrl)}
                </span>
              </a>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-sm text-tx-2 col-span-full py-8 text-center">
              {assessoria.documents.length === 0 ? "Nenhum documento cadastrado ainda." : "Nenhum documento encontrado com esse filtro."}
            </p>
          )}
        </div>
      )}

      {viewMode === "list" && (
        <div className="divide-y divide-regua border-y border-regua">
          {sorted.map((d) => {
            const Icon = getDocumentTypeIcon(d.docType);
            return (
              <a
                key={d.id}
                href={d.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2 hover:bg-sf-apoio"
              >
                <Icon size={14} className="shrink-0 text-tx-2" />
                <span className="text-sm font-medium text-tx truncate" title={d.name}>
                  {d.name}
                </span>
                {d.parecer && <ParecerBadge name={d.parecer.name} />}
                <span className="hidden sm:inline text-[11px] text-tx-2 shrink-0">
                  {getDocumentTypeLabel(d.docType)}
                </span>
                <span className="flex-1" />
                <span className="shrink-0 text-[11px] text-tx-2">{formatDate(d.date)}</span>
              </a>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-sm text-tx-2 py-8 text-center">
              {assessoria.documents.length === 0 ? "Nenhum documento cadastrado ainda." : "Nenhum documento encontrado com esse filtro."}
            </p>
          )}
        </div>
      )}

      {viewMode === "details" && (
        <div className="overflow-x-auto">
          {sorted.length === 0 ? (
            <p className="text-sm text-tx-2 py-8 text-center">
              {assessoria.documents.length === 0 ? "Nenhum documento cadastrado ainda." : "Nenhum documento encontrado com esse filtro."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-tx-2 border-b border-regua">
                  <th className="pb-2 pr-3">Nome</th>
                  <th className="pb-2 pr-3">Formato</th>
                  <th className="pb-2 pr-3">Categoria</th>
                  <th className="pb-2 pr-3">Data</th>
                  <th className="pb-2 pr-3">Vinculado a</th>
                  <th className="pb-2 pr-3">Enviado por</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {sorted.map((d) => {
                  const Icon = getDocumentTypeIcon(d.docType);
                  return (
                    <tr key={d.id}>
                      <td className="py-2.5 pr-3 font-medium text-tx">
                        <span className="flex items-center gap-2">
                          <Icon size={15} className="text-tx-2 shrink-0" />
                          {d.name}
                          {d.parecer && <ParecerBadge name={d.parecer.name} />}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-tx-2 tabular-nums">{formatoArquivo(d.name, d.driveUrl)}</td>
                      <td className="py-2.5 pr-3 text-tx-2">{getDocumentTypeLabel(d.docType)}</td>
                      <td className="py-2.5 pr-3 text-tx-2">{formatDate(d.date)}</td>
                      <td className="py-2.5 pr-3 text-tx-2">{d.case?.title || "—"}</td>
                      <td className="py-2.5 pr-3 text-tx-2">{d.uploadedBy?.name || "—"}</td>
                      <td className="py-2.5">
                        <a
                          href={d.driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-marca-tx font-semibold text-xs"
                        >
                          <ExternalLink size={11} /> {getLinkSourceLabel(d.driveUrl)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
