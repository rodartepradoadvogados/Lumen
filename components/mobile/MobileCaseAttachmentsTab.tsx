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
      <p className="text-xs text-navy-800/45 dark:text-cream-50/45 bg-cream-100 dark:bg-white/5 rounded-lg px-3 py-2">
        Só leitura por aqui — para enviar ou gerar um novo anexo, use o computador.
      </p>
      <Card>
        {attachments.length === 0 ? (
          <EmptyState title="Nenhum anexo" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {attachments.map((a) => {
              const Icon = getDocumentTypeIcon(a.docType);
              return (
                <a
                  key={a.id}
                  href={a.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-4 py-3 hover:bg-cream-100 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="p-1.5 rounded-lg bg-gold-500/10 text-gold-700 dark:text-gold-400 shrink-0">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy-900 dark:text-cream-50 truncate">{a.name}</p>
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                      {getDocumentTypeLabel(a.docType)} · {formatDate(a.createdAt)}
                      {a.uploadedBy && <> · {a.uploadedBy.name}</>}
                      {a.driveUrl.startsWith("http") && !a.driveUrl.includes("drive.google.com") && <> · {getLinkSourceLabel(a.driveUrl)}</>}
                    </p>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-navy-800/30 dark:text-cream-50/30" />
                </a>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
