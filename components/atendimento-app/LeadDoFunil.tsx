import Link from "next/link";
import { formatCurrency } from "@/components/ui";
import { stageOptions as STAGES, stageLabels } from "@/lib/funil";
import EstagioDoLeadSelect from "@/components/atendimento/EstagioDoLeadSelect";
import Avatar from "@/components/atendimento-app/ui/Avatar";
import Selinho from "@/components/atendimento-app/ui/Selinho";

// O CARTÃO DE LEAD DO FUNIL NO APP (acabamento WhatsApp): sem contorno pesado, num fundo levemente mais claro
// que a coluna. A linha de cima abre a conversa (alvo >= 72 px); o seletor de fase fica FORA do link (irmão),
// discreto, com o alvo de 44 px. O recorte de acesso é da página (whereDoAtendimento), não daqui.

const ROTULO_DA_ORIGEM: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

export type LeadDoFunilDados = {
  id: string;
  clientName: string;
  subject: string;
  stage: string;
  estimatedValue: number | null;
  leadSource: string | null;
  responsavel: string | null;
  lostReason: string | null;
  dias: number;
  followUpAtrasado: boolean;
};

export default function LeadDoFunil({ lead }: { lead: LeadDoFunilDados }) {
  const estagio = STAGES.includes(lead.stage) ? lead.stage : "NOVO";
  return (
    <div data-lead-do-funil="" className="rounded-atd-balao bg-atd-tela">
      <Link href={`/atendimento-app/${lead.id}`} className="flex min-h-[72px] gap-3 rounded-atd-balao px-3 pb-2 pt-3 hover:bg-atd-linha-hover active:bg-atd-linha-hover">
        <Avatar nome={lead.clientName} tamanho="md" />
        <span className="min-w-0 flex-1">
          <span className="block text-app-nome font-semibold leading-snug text-tx">{lead.clientName}</span>
          <span className="mt-0.5 line-clamp-2 block text-app-previa text-atd-previa">{lead.subject}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Selinho tom="fase">{stageLabels[estagio]}</Selinho>
            {lead.followUpAtrasado && <Selinho tom="alerta">Follow-up atrasado</Selinho>}
            {lead.estimatedValue != null && lead.estimatedValue > 0 && <Selinho tom="neutro">{formatCurrency(lead.estimatedValue)}</Selinho>}
            {lead.leadSource && <Selinho tom="neutro">{ROTULO_DA_ORIGEM[lead.leadSource] || lead.leadSource}</Selinho>}
          </span>
          <span className="mt-1.5 flex items-center justify-between gap-2 text-app-meta text-atd-terciario">
            <span>{lead.dias} dia(s) no estágio</span>
            {lead.responsavel && <span className="max-w-[50%] truncate">{lead.responsavel}</span>}
          </span>
          {lead.stage === "PERDIDO" && lead.lostReason && <span className="mt-1 block text-app-meta italic text-atd-terciario">Motivo: {lead.lostReason}</span>}
        </span>
      </Link>
      <div className="px-3 pb-2">
        <EstagioDoLeadSelect
          atendimentoId={lead.id}
          estagioAtual={lead.stage}
          opcoes={STAGES.filter((s) => s !== "PERDIDO" || lead.stage === "PERDIDO").map((s) => ({ valor: s, rotulo: stageLabels[s] }))}
        />
      </div>
    </div>
  );
}
