import Link from "next/link";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";
import Avatar from "@/components/atendimento-app/ui/Avatar";
import Selinho from "@/components/atendimento-app/ui/Selinho";

// A LINHA DA FILA DE TRIAGEM NO APP: igual à da lista de Conversas (avatar, sem divisória, selinhos, linha
// inteira é o alvo, >= 72 px). Abre a conversa; o recorte de acesso é da página.

const ROTULO_DO_CANAL: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export type LinhaDaTriagemDados = {
  id: string;
  clientName: string;
  subject: string;
  status: string;
  channel: string;
  area: string | null;
  data: string;
  responsavel: string | null;
};

export default function LinhaDaTriagem({ linha }: { linha: LinhaDaTriagemDados }) {
  return (
    <Link href={`/atendimento-app/${linha.id}`} data-linha-da-triagem="" className="flex min-h-[72px] gap-3.5 px-4 py-[11px] hover:bg-atd-linha-hover active:bg-atd-linha-hover">
      <Avatar nome={linha.clientName} tamanho="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-app-nome text-tx">{linha.clientName}</span>
          <span className="shrink-0 text-app-meta tabular-nums text-atd-terciario">{linha.data}</span>
        </span>
        <span className="mt-0.5 block truncate text-app-previa text-atd-previa">{linha.subject}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Selinho tom={linha.status === "NOVO" || linha.status === "EM_TRIAGEM" ? "fase" : "neutro"}>{attendanceStatusLabels[linha.status] ?? linha.status}</Selinho>
          <Selinho tom="neutro">{ROTULO_DO_CANAL[linha.channel] ?? linha.channel}</Selinho>
          {linha.area && <Selinho tom="neutro">{linha.area}</Selinho>}
          {linha.responsavel && <span className="truncate text-app-meta text-atd-terciario">{linha.responsavel}</span>}
        </span>
      </span>
    </Link>
  );
}
