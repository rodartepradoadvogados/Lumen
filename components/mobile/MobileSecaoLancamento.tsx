import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Equivalente mobile de components/financeiro/SecaoLancamento.tsx — mesmas cores de seção (as
// variáveis --secao-<tom>-bg/-border de app/globals.css, reaproveitadas tal qual para o app ficar
// coerente com o site), mas como <details>/<summary> recolhível em vez de <section> sempre
// aberta: o formulário de Lançar Honorários no mobile (MobileLancarHonorariosForm) é bem mais
// longo que cabe numa tela de polegar, então cada bloco pode ser fechado depois de preenchido —
// mesmo padrão já usado em app/m/processos/[id]/page.tsx para "Publicações e Andamentos".
export type SecaoTone = "palha" | "azul" | "ouro" | "verde" | "rosa";

export default function MobileSecaoLancamento({
  title,
  tone,
  children,
  defaultOpen = true,
}: {
  title: string;
  tone: SecaoTone;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className={`secao-lancamento secao-lancamento--${tone} group rounded-lg border-l-[3px]`}>
      <summary className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tx-2">{title}</h4>
        <ChevronDown size={14} className="shrink-0 text-tx-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3.5 pb-3.5 pt-2.5 space-y-3 border-t border-regua">{children}</div>
    </details>
  );
}
