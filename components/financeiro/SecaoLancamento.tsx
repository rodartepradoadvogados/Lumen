import type { ReactNode } from "react";

// Bloco de formulário reutilizável para as telas novas do Financeiro (Fase 2: Lançar Honorários;
// Fase 3: Contas a Pagar/Receber vão reaproveitar) — título em versalete, fio horizontal e um tom
// de preenchimento PRÓPRIO por seção, pensado para o usuário reconhecer de relance qual bloco é
// qual num formulário longo, sem depender só da leitura do título.
//
// As cores em si vêm de variáveis CSS declaradas em app/globals.css (--secao-<tom>-bg/-border),
// não de classes utilitárias Tailwind com hex solto (`bg-[#...]`) — Tailwind não gera classes
// para strings montadas em runtime a partir de uma prop (`tone`), então
// `bg-[var(--secao-${tone}-bg)]` simplesmente não seria compilado.
export type SecaoTone = "palha" | "azul" | "ouro" | "verde" | "rosa";

export default function SecaoLancamento({
  title,
  tone,
  children,
}: {
  title: string;
  tone: SecaoTone;
  children: ReactNode;
}) {
  return (
    <section
      className={`secao-lancamento secao-lancamento--${tone} rounded-lg border-l-[3px] px-4 py-3.5`}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-navy-800/55 dark:text-cream-50/55 pb-2 mb-3 border-b border-navy-800/10 dark:border-white/10">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
