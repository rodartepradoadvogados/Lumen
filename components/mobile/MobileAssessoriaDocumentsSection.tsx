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
// abas: "Demandas, Processos e Casos" (as pastas de Parecer — "Demanda" é só o rótulo novo do
// mesmo model, ver AssessoriaProcessosCasosTab.tsx + ParecerFolderRow.tsx) e "Documentos" (a
// lista achatada de todo o resto, ver AssessoriaDocumentosTab.tsx). Aqui cabe tudo numa seção só.
//
// Reavaliado nesta rodada (auditoria pediu pra considerar habilitar envio de documento também no
// mobile): continua só leitura, de propósito. O upload do desktop (ParecerFolderRow.tsx) sobe
// pro Vercel Blob e depois chama um <DocumentTypeSelect> pra escolher a categoria do arquivo —
// e tanto DocumentTypeSelect.tsx quanto lib/documentTypes.ts (a lista de categorias) estão sendo
// reescritos por outro agente agora mesmo. Implementar um seletor de categoria próprio aqui
// significaria duplicar (e provavelmente divergir de) uma peça que está mudando de baixo dos pés
// nesta mesma rodada — por isso a leitura fica pronta e migrada de paleta, mas o upload em si
// fica pra uma próxima rodada, depois que aquele componente estabilizar. Ver relato final desta
// tarefa.
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
      <div className="px-4 py-3 border-b border-regua flex items-center justify-between gap-2">
        <h2 className="font-serif font-bold text-tx text-sm">Documentos</h2>
        {total > 0 && (
          <span className="text-xs text-tx-2 shrink-0">
            {total} documento{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {nadaParaMostrar ? (
        <EmptyState title="Nenhum documento cadastrado" />
      ) : (
        <div className="divide-y divide-regua">
          {pareceres.map((p) => (
            <ParecerFolderMobileRow key={p.id} parecer={p} />
          ))}

          {soltos.length > 0 && pareceres.length > 0 && (
            <p className="px-4 pt-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-tx-2">
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
      <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-sf-apoio">
        <span className="flex items-center gap-2 min-w-0">
          <FolderOpen size={16} className="shrink-0 text-marca-tx" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-tx truncate">{parecer.name}</span>
            <span className="block text-xs text-tx-2">
              {parecer.documents.length} documento{parecer.documents.length === 1 ? "" : "s"} · {formatDate(parecer.date)}
            </span>
          </span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-tx-3 transition-transform group-open:rotate-180" />
      </summary>

      <div className="px-4 pb-3 pt-0.5 bg-sf-apoio">
        {parecer.description && <p className="text-xs text-tx-2 whitespace-pre-wrap py-2">{parecer.description}</p>}
        {parecer.documents.length === 0 ? (
          <p className="text-xs text-tx-2 py-2">Nenhum documento dentro desta demanda ainda.</p>
        ) : (
          <div className="divide-y divide-regua">
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
      className={`flex items-center gap-2.5 py-3 hover:bg-sf-apoio ${indent ? "pl-2 pr-0" : "px-4"}`}
    >
      <Icon size={15} className="shrink-0 text-tx-2" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tx truncate">{doc.name}</p>
        <p className="text-xs text-tx-2 mt-0.5">
          {getDocumentTypeLabel(doc.docType)} · {formatDate(doc.date)}
        </p>
      </div>
      <ExternalLink size={14} className="text-tx-3 shrink-0" />
    </a>
  );
}
