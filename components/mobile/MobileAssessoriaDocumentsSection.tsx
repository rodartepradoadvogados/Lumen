import Link from "next/link";
import { Card, EmptyState, formatDate } from "@/components/ui";
import { getDocumentTypeIcon, getDocumentTypeLabel, isEmpresaDocumentType } from "@/lib/documentTypes";
import MobileDocumentUpload from "@/components/mobile/MobileDocumentUpload";
import StorageDisconnectedNotice from "@/components/assessoria/StorageDisconnectedNotice";
import { ChevronRight, ExternalLink, FolderOpen, Building2, Plus } from "lucide-react";

type DocumentoItem = { id: string; name: string; docType: string; driveUrl: string; date: Date | string };

// Formato mínimo que este componente precisa de assessoria.pareceres e assessoria.documents (ver
// getAssessoriaDetail em lib/actions/assessoria.ts) — mesmo espírito de ParecerData em
// components/assessoria/ParecerFolderRow.tsx (arquivo proibido, só consultado como referência de
// vocabulário: "Parecer"/"pasta").
export type ParecerFolder = { id: string; name: string; date: Date | string; description: string | null; documents: DocumentoItem[] };
export type AssessoriaDocumento = DocumentoItem & { parecer: { id: string; name: string } | null };

// Seção "Documentos" da Assessoria no app — equivalente mobile combinando o que no site são duas
// abas: "Demandas, Processos e Casos" (as pastas de Parecer — "Demanda" é só o rótulo novo do
// mesmo model, ver AssessoriaProcessosCasosTab.tsx + ParecerFolderRow.tsx) e "Documentos" (a
// lista achatada de todo o resto, ver AssessoriaDocumentosTab.tsx). Aqui cabe tudo numa seção só.
//
// Reavaliado nesta rodada (auditoria pediu pra considerar habilitar envio de documento também no
// mobile): DocumentTypeSelect.tsx e lib/documentTypes.ts — o que travava o upload na rodada
// anterior — já estabilizaram, então o envio passa a existir aqui também (ver
// components/mobile/MobileDocumentUpload.tsx, mesmo fluxo de duas etapas do desktop, um arquivo
// por vez em vez da fila de vários do ParecerFolderRow — mais simples de operar com o polegar).
// Só aparece quando `storageConnected` (Drive/OneDrive/Dropbox do escritório, ver
// lib/storageProvider.ts — checagem por PROVEDOR, não só Drive, mesmo bug já corrigido em
// app/(app)/processos/novo/page.tsx) — sem armazenamento conectado não há pasta de destino.
//
// `documents` (prop) é a lista COMPLETA vinda de assessoria.documents — inclui tanto os soltos
// quanto os que já estão dentro de uma pasta (cada um carrega `parecer: {id,name}|null` dizendo
// isso). Para não duplicar nada, só usamos daqui os que têm parecer===null; o conteúdo de cada
// pasta vem de `parecer.documents` (assessoria.pareceres), nunca filtrando este array por
// parecerId — as duas fontes descrevem os mesmos registros, então usar as duas pra a mesma pasta
// re-listaria cada documento em dobro.
export default function MobileAssessoriaDocumentsSection({
  assessoriaId,
  pareceres,
  documents,
  storageConnected,
  storageMessage,
}: {
  assessoriaId: string;
  pareceres: ParecerFolder[];
  documents: AssessoriaDocumento[];
  storageConnected: boolean;
  storageMessage?: string;
}) {
  const soltos = documents.filter((d) => !d.parecer);
  const total = documents.length;
  // Recorte por categoria sobre o MESMO catálogo (contrato social, procuração, alteração
  // contratual, alvará... ver isEmpresaDocumentType, lib/documentTypes.ts) — não remove nada das
  // listas abaixo, só destaca em cima, mesmo espírito do equivalente desktop
  // (AssessoriaDocumentosTab.tsx).
  const empresaDocs = documents.filter((d) => isEmpresaDocumentType(d.docType));
  // Uma pasta pode existir sem nenhum documento dentro ainda — o total de documentos seria 0
  // mesmo com a pasta lá. Some para o estado vazio só quando não há NEM pasta NEM documento
  // nenhum E não há como enviar um novo; do contrário o card precisa continuar visível.
  const nadaParaMostrar = pareceres.length === 0 && total === 0 && !storageConnected;

  return (
    <Card>
      <div className="px-4 py-3 border-b border-regua flex items-center justify-between gap-2">
        <h2 className="font-bold text-tx text-sm">Documentos</h2>
        {total > 0 && (
          <span className="text-corpo text-tx-2 shrink-0">
            {total} documento{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {nadaParaMostrar ? (
        <EmptyState title="Nenhum documento cadastrado" />
      ) : (
        <>
          {empresaDocs.length > 0 && (
            <div className="border-b border-regua">
              <p className="px-4 pt-3 pb-0.5 text-corpo font-semibold uppercase tracking-wide text-tx-2 flex items-center gap-1.5">
                <Building2 size={12} /> Documentos da Empresa
              </p>
              <div className="divide-y divide-regua">
                {empresaDocs.map((d) => (
                  <DocumentoRow key={d.id} doc={d} />
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-regua">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
              <p className="text-corpo font-semibold uppercase tracking-wide text-tx-2">Demandas</p>
              <Link href={`/m/assessoria/${assessoriaId}/pareceres/nova`} className="flex items-center gap-1 text-corpo font-semibold text-marca-tx shrink-0">
                <Plus size={11} /> Nova
              </Link>
            </div>
            {pareceres.length === 0 ? (
              <p className="px-4 pb-3 text-corpo text-tx-3">Nenhuma demanda cadastrada ainda.</p>
            ) : (
              <div className="divide-y divide-regua">
                {pareceres.map((p) => (
                  <Link key={p.id} href={`/m/assessoria/${assessoriaId}/pareceres/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <FolderOpen size={15} className="shrink-0 text-marca-tx" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-tx truncate">{p.name}</span>
                        <span className="block text-corpo text-tx-2">
                          {p.documents.length} documento{p.documents.length === 1 ? "" : "s"} · {formatDate(p.date)}
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-tx-3" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="divide-y divide-regua">
            {soltos.length > 0 && (
              <p className="px-4 pt-3 pb-0.5 text-corpo font-semibold uppercase tracking-wide text-tx-2">
                Sem pasta
              </p>
            )}

            {soltos.map((d) => (
              <DocumentoRow key={d.id} doc={d} />
            ))}
          </div>

          <div className="p-3 border-t border-regua">
            {storageConnected ? <MobileDocumentUpload assessoriaId={assessoriaId} /> : <StorageDisconnectedNotice message={storageMessage} />}
          </div>
        </>
      )}
    </Card>
  );
}

function DocumentoRow({ doc, indent }: { doc: DocumentoItem; indent?: boolean }) {
  const Icon = getDocumentTypeIcon(doc.docType);
  return (
    <a
      href={doc.driveUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2.5 py-3 hover:bg-sf-apoio ${indent ? "pl-2 pr-0" : "px-4"}`}
    >
      <Icon size={15} className="shrink-0 text-tx-2" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tx truncate">{doc.name}</p>
        <p className="text-corpo text-tx-2 mt-0.5">
          {getDocumentTypeLabel(doc.docType)} · {formatDate(doc.date)}
        </p>
      </div>
      <ExternalLink size={14} className="text-tx-3 shrink-0" />
    </a>
  );
}
