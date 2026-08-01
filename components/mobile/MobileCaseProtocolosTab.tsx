import { Card, Badge, EmptyState, formatCalendarDate } from "@/components/ui";
import { ExternalLink, FolderOpen } from "lucide-react";

type Lote = {
  id: string;
  titulo: string;
  status: string;
  numeroProtocolo: string | null;
  protocoladoEm: string | null;
  driveFolderId: string | null;
  comprovante: { id: string; name: string; driveUrl: string } | null;
  createdAt: string;
  itens: { id: string; nomeSnapshot: string; driveUrl: string | null }[];
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

// Aba Protocolos do processo, versão mobile — só leitura (lotes, status, itens e o link da
// pasta-espelho/comprovante quando existir). Montar um lote novo (selecionar anexos, gerar pasta
// no Drive, registrar o protocolo) fica só no site — components/protocolos/ProtocolosTab.tsx é um
// fluxo bem mais longo (três modais) que não caberia num formulário de polegar sem reduzir a
// funcionalidade real, e o pedido desta fase é ver/lançar honorário, não montar protocolo.
export default function MobileCaseProtocolosTab({ lotes }: { lotes: Lote[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-navy-800/45 dark:text-cream-50/45 bg-cream-100 dark:bg-white/5 rounded-lg px-3 py-2">
        Só leitura por aqui — para montar ou registrar um protocolo, use o computador.
      </p>
      <Card>
        {lotes.length === 0 ? (
          <EmptyState title="Nenhum protocolo ainda" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {lotes.map((lote) => (
              <div key={lote.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{lote.titulo}</p>
                    <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-0.5">
                      {lote.itens.length} documento{lote.itens.length === 1 ? "" : "s"}
                      {lote.numeroProtocolo && <> · nº {lote.numeroProtocolo}</>}
                      {lote.protocoladoEm && <> · protocolado em {formatCalendarDate(lote.protocoladoEm)}</>}
                    </p>
                  </div>
                  <Badge color={STATUS_COLOR[lote.status] ?? "slate"}>{STATUS_LABEL[lote.status] ?? lote.status}</Badge>
                </div>
                {(lote.driveFolderId || lote.comprovante) && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {lote.driveFolderId && (
                      <a
                        href={`https://drive.google.com/drive/folders/${lote.driveFolderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline"
                      >
                        <FolderOpen size={12} /> Pasta do lote
                      </a>
                    )}
                    {lote.comprovante && (
                      <a
                        href={lote.comprovante.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 dark:text-gold-400 hover:underline"
                      >
                        <ExternalLink size={12} /> Comprovante
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
