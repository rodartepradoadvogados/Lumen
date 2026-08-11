import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Equivalente mobile de components/financeiro/SecaoLancamento.tsx — mesmas cores de seção (a
// classe utilitária `secao-lancamento--<tom>` de app/globals.css, reaproveitada tal qual para o
// app ficar coerente com o site: fundo `--sf-apoio` + filete esquerdo de 3px por tom, DESIGN-
// SYSTEM.md §11), mas como <details>/<summary> recolhível em vez de <section> sempre aberta: o
// formulário de Lançar Honorários no mobile (MobileLancarHonorariosForm) é bem mais longo que
// cabe numa tela de polegar, então cada bloco pode ser fechado depois de preenchido — mesmo
// padrão já usado em app/m/processos/[id]/page.tsx para "Publicações e Andamentos".
export type SecaoTone = "palha" | "azul" | "ouro" | "verde" | "rosa";

// Cor do rótulo do cabeçalho — MESMA cor do filete, exceto "ouro" (usa --marca-tx em vez de
// --marca: ouro só pode carregar texto no tom que virou texto, DESIGN-SYSTEM.md §0.2). Mesmo
// mapa de components/financeiro/SecaoLancamento.tsx.
const labelToneClassName: Record<SecaoTone, string> = {
  azul: "text-acao",
  palha: "text-tx-2",
  ouro: "text-marca-tx",
  rosa: "text-atencao",
  verde: "text-concluido",
};

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
    <details open={defaultOpen} className={`secao-lancamento secao-lancamento--${tone} group rounded-r-lg border-l-[3px]`}>
      <summary className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <h4 className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelToneClassName[tone]}`}>{title}</h4>
        <ChevronDown size={14} className="shrink-0 text-tx-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-3.5 pb-3.5 pt-2.5 space-y-3 border-t border-regua">{children}</div>
    </details>
  );
}
