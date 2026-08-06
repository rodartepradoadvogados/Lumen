import { Card, EmptyState, formatDate } from "@/components/ui";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { ChevronDown, ExternalLink, FolderOpen } from "lucide-react";

type DocumentoItem = { id: string; name: string; docType: string; driveUrl: string; date: Date | string };

// Formato mínimo que este componente precisa de assessoria.pareceres e assessoria.documents (ver
// getAssessoriaDetail em lib/actions/assessoria.ts) — mesmo espírito de ParecerData em
// components/assessoria/ParecerFolderRow.tsx (arquivo proibido, só consultado como referência de
// vocabulário: "Parecer"/"pasta").
export type ParecerFolder = { id: string; name: string; date: Date | string; description: string | null; documents: DocumentoItem[] };
export type AssessoriaDocumento = DocumentoItem & { parecer: { id: string; name: string } | null };

// Seção "Documentos" da Assessoria no app — equivalente mobile combinando o que no site são duas
// abas: "Pareceres, Processos e Casos" (as pastas de Parecer, ver AssessoriaProcessosCasosTab.tsx
// + ParecerFolderRow.tsx) e "Documentos" (a lista achatada de todo o resto, ver
// AssessoriaDocumentosTab.tsx). Aqui cabe tudo numa seção só, só leitura: sem upload nem edição
// de pasta — no celular, entre audiências, ler rápido importa mais que gerenciar arquivo.
//
// `documents` (prop) é a lista COMPLETA vinda de assessoria.documents — inclui tanto os soltos
// quanto os que já estão dentro de uma pasta (cada um carrega `parecer: {id,name}|null` dizendo
// isso). Para não duplicar nada, só usamos daqui os que têm parecer===null; o conteúdo de cada
// pasta vem de `parecer.documents` (assessoria.pareceres), nunca filtrando este array por
// parecerId — as duas fontes descrevem os mesmos registros, então usar as duas pra a mesma pasta
// re-listaria cada documento em dobro.
export default function MobileAssessoriaDocumentsSection({
  pareceres,
  documents,
}: {
  pareceres: ParecerFolder[];
  documents: AssessoriaDocumento[];
}) {
  const soltos = documents.filter((d) => !d.parecer);
  const total = documents.length;
  // Uma pasta pode existir sem nenhum documento dentro ainda — o total de documentos seria 0
  // mesmo com a pasta lá. Some para o estado vazio só quando não há NEM pasta NEM documento
  // nenhum; do contrário a pasta vazia precisa continuar visível (nada pode sumir da vista).
  const nadaParaMostrar = pareceres.length === 0 && total === 0;

  return (
    <Card>
      <div className="px-4 py-3 border-b border-navy-800/8 dark:border-white/10 flex items-center justify-between gap-2">
        <h2 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Documentos</h2>
        {total > 0 && (
          <span className="text-xs text-navy-800/40 dark:text-cream-50/40 shrink-0">
            {total} documento{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {nadaParaMostrar ? (
        <EmptyState title="Nenhum documento cadastrado" />
      ) : (
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {pareceres.map((p) => (
            <ParecerFolderMobileRow key={p.id} parecer={p} />
          ))}

          {soltos.length > 0 && pareceres.length > 0 && (
            <p className="px-4 pt-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-navy-800/40 dark:text-cream-50/40">
              Sem pasta
            </p>
          )}

          {soltos.map((d) => (
            <DocumentoRow key={d.id} doc={d} />
          ))}
        </div>
      )}
    </Card>
  );
}

// Uma linha "pasta" de Parecer, recolhível via <details>/<summary> nativo — mesmo padrão de
// components/mobile/MobileSecaoLancamento.tsx, sem precisar de "use client". A área de toque é a
// <summary> inteira (px-4 py-3.5), confortável para o polegar.
function ParecerFolderMobileRow({ parecer }: { parecer: ParecerFolder }) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-cream-50 dark:hover:bg-white/5">
        <span className="flex items-center gap-2 min-w-0">
          <FolderOpen size={16} className="shrink-0 text-gold-700 dark:text-gold-400" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{parecer.name}</span>
            <span className="block text-xs text-navy-800/45 dark:text-cream-50/45">
              {parecer.documents.length} documento{parecer.documents.length === 1 ? "" : "s"} · {formatDate(parecer.date)}
            </span>
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-navy-800/30 dark:text-cream-50/30 transition-transform group-open:rotate-180" />
      </summary>

      <div className="px-4 pb-3 pt-0.5 bg-cream-50/60 dark:bg-white/[0.03]">
        {parecer.description && <p className="text-xs text-navy-800/55 dark:text-cream-50/55 whitespace-pre-wrap py-2">{parecer.description}</p>}
        {parecer.documents.length === 0 ? (
          <p className="text-xs text-navy-800/40 dark:text-cream-50/40 py-2">Nenhum documento dentro deste parecer ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {parecer.documents.map((d) => (
              <DocumentoRow key={d.id} doc={d} indent />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function DocumentoRow({ doc, indent }: { doc: DocumentoItem; indent?: boolean }) {
  const Icon = getDocumentTypeIcon(doc.docType);
  return (
    <a
      href={doc.driveUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2.5 py-3 hover:bg-cream-50 dark:hover:bg-white/5 ${indent ? "pl-2 pr-0" : "px-4"}`}
    >
      <Icon size={15} className="shrink-0 text-navy-800/40 dark:text-cream-50/40" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{doc.name}</p>
        <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-0.5">
          {getDocumentTypeLabel(doc.docType)} · {formatDate(doc.date)}
        </p>
      </div>
      <ExternalLink size={14} className="text-navy-800/30 dark:text-cream-50/30 shrink-0" />
    </a>
  );
}
