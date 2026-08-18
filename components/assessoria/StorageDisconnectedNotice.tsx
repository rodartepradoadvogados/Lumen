import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Antes, quando o armazenamento em nuvem do escritório não estava conectado (nunca conectado,
// ou token expirado/revogado — ver getDriveStatus em lib/googleDrive.ts), a área de anexar
// documento de cada demanda (Parecer) simplesmente sumia da tela, sem nenhuma explicação: o
// usuário expandia a linha e não via nada, sem saber se era um bug ou falta de permissão.
// `message` (quando vem de getStorageConnectionStatus) já traz o motivo específico — usa um
// texto genérico só quando a checagem de OneDrive/Dropbox não devolve mensagem própria.
export default function StorageDisconnectedNotice({ message }: { message?: string }) {
  return (
    <div className="rounded-lg border border-aviso/25 bg-aviso-bg px-3 py-2 flex items-center gap-2 flex-wrap">
      <AlertTriangle size={13} className="shrink-0 text-aviso" />
      <span className="text-xs font-medium text-aviso flex-1 min-w-0">
        {message || "Conecte o armazenamento em nuvem do escritório para anexar documentos."}
      </span>
      <Link
        href="/configuracoes?secao=modelos&cat=conexoes"
        className="text-xs font-semibold text-aviso underline decoration-aviso/50 hover:decoration-aviso shrink-0"
      >
        Ir para Configurações
      </Link>
    </div>
  );
}
