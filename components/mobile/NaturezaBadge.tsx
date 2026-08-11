import { NATUREZA_LABELS, type CaseNatureza } from "@/lib/caseNatureza";

// Etiqueta pequena de natureza reutilizada na listagem e no detalhe do processo mobile —
// mesma paleta em qualquer tema (Manhã/Noite, via tokens semânticos): azul-tinta (--acao)
// para Judicial (a categoria principal do fluxo do escritório), neutro de apoio para
// Administrativo (categoria secundária) e para Caso (o "resto" — extrajudicial e os
// legados Atendimento/Consultivo, ver lib/caseNatureza.ts). Ouro fica reservado à marca e
// à seção ativa (DESIGN-SYSTEM.md §7) — não é mais cor de categoria aqui.
const TONE: Record<CaseNatureza, string> = {
  JUDICIAL: "bg-acao-bg text-acao",
  ADMINISTRATIVO: "bg-sf-apoio text-tx-2",
  CASO: "bg-sf-apoio text-tx",
};

export default function NaturezaBadge({ natureza, className = "" }: { natureza: CaseNatureza; className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${TONE[natureza]} ${className}`}
    >
      {NATUREZA_LABELS[natureza]}
    </span>
  );
}
