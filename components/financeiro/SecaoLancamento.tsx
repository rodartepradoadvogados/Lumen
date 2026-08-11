import type { ReactNode } from "react";

// Bloco de formulário reutilizável para as telas do Financeiro (Lançar Honorários, Contas a
// Pagar/Receber) — título em versalete, fio horizontal e um filete de 3px por seção, pensado
// para o usuário reconhecer de relance qual bloco é qual num formulário longo, sem depender só
// da leitura do título.
//
// DESIGN-SYSTEM.md §11: os cinco fundos coloridos cheios saíram — cada seção agora é fundo
// neutro (`--sf-apoio`, pintado pela classe `secao-lancamento--<tom>` em app/globals.css) +
// filete esquerdo de 3px na cor que identifica a seção, raio `0 5px 5px 0`. O rótulo do
// cabeçalho usa a MESMA cor do filete — exceto no tom "ouro" (Honorário), que usa `--marca-tx`
// em vez de `--marca`: ouro só pode carregar texto sobre fundo claro no tom que virou texto
// (regra §0.2), o filete continua em `--marca`.
//
// As cores em si vêm de classes utilitárias Tailwind que apontam para os tokens semânticos
// (`text-acao`, `text-marca-tx`, ...), nunca de hex solto (`bg-[#...]`) — Tailwind não gera
// classes para strings montadas em runtime a partir de uma prop (`tone`), então
// `text-[var(--secao-${tone})]` simplesmente não seria compilado; por isso o mapa abaixo lista
// a classe inteira por tom.
export type SecaoTone = "palha" | "azul" | "ouro" | "verde" | "rosa";

const labelToneClassName: Record<SecaoTone, string> = {
  azul: "text-acao", // Contato / Identificação
  palha: "text-tx-2", // Assunto e matéria
  ouro: "text-marca-tx", // Honorário
  rosa: "text-atencao", // Pendências
  verde: "text-concluido", // Anexos
};

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
      className={`secao-lancamento secao-lancamento--${tone} rounded-r-lg border-l-[3px] px-4 py-3.5`}
    >
      <h4
        className={`text-[10px] font-semibold uppercase tracking-[0.11em] pb-2 mb-3 border-b border-regua ${labelToneClassName[tone]}`}
      >
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
