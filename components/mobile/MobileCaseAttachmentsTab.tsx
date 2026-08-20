import { Card, EmptyState, formatDate } from "@/components/ui";
import { getDocumentTypeIcon, getDocumentTypeLabel, getLinkSourceLabel } from "@/lib/documentTypes";
import { ExternalLink } from "lucide-react";

type AttachmentData = {
  id: string;
  name: string;
  driveUrl: string;
  docType: string;
  createdAt: string;
  uploadedBy: { name: string } | null;
};

// Lista de Anexos mobile — só leitura (nome, tipo de documento e link pro Drive). Reaproveitada
// tanto no Processo (aba Anexos) quanto no Atendimento (seção Anexos): enviar/organizar anexo de
// um registro já existente continua no site (components/AttachmentList.tsx, com upload de
// verdade). O único upload que o app mobile já faz é ao CRIAR um caso novo (ver
// components/NewCaseAttachmentsField.tsx dentro de MobileNewCaseForm — um estágio antes do caso
// existir). Replicar o fluxo de upload direto para um registro já existente é tarefa maior, fora
// do escopo deste componente.
export default function MobileCaseAttachmentsTab({ attachments }: { attachments: AttachmentData[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-tx-2 bg-sf-apoio px-3 py-2">
        Só leitura por aqui — para enviar ou gerar um novo anexo, use o computador.
      </p>
      <Card>
        {attachments.length === 0 ? (
          <EmptyState title="Nenhum anexo" />
        ) : (
          <div className="divide-y divide-regua">
            {attachments.map((a) => {
              const Icon = getDocumentTypeIcon(a.docType);
              return (
                <a
                  key={a.id}
                  href={a.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-3 hover:bg-sf-apoio transition-colors"
                >
                  <span className="p-1.5 bg-marca-bg text-marca-tx shrink-0">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-tx truncate">{a.name}</p>
                    <p className="text-[11px] text-tx-2">
                      {getDocumentTypeLabel(a.docType)} · {formatDate(a.createdAt)}
                      {a.uploadedBy && <> · {a.uploadedBy.name}</>}
                      {a.driveUrl.startsWith("http") && !a.driveUrl.includes("drive.google.com") && <> · {getLinkSourceLabel(a.driveUrl)}</>}
                    </p>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-tx-3" />
                </a>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
