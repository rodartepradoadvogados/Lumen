import { NATUREZA_LABELS, type CaseNatureza } from "@/lib/caseNatureza";

// Etiqueta pequena de natureza reutilizada na listagem e no detalhe do processo mobile —
// mesma paleta em qualquer tema (Manhã/Noite), só a intensidade do fundo muda: dourado
// para Judicial (cor de destaque principal da marca), bordô para Administrativo (cor
// secundária, mesma associação já usada em Assessoria/Licitações) e navy para Caso (o
// "resto" — extrajudicial e os legados Atendimento/Consultivo, ver lib/caseNatureza.ts).
const TONE: Record<CaseNatureza, string> = {
  JUDICIAL: "bg-gold-500/15 text-gold-800 dark:bg-gold-400/15 dark:text-gold-400",
  ADMINISTRATIVO: "bg-bordo-100 text-bordo-700 dark:bg-bordo-400/15 dark:text-bordo-400",
  CASO: "bg-navy-900/10 text-navy-900 dark:bg-white/10 dark:text-cream-50",
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
