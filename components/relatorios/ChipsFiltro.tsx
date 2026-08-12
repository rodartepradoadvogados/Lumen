"use client";

import clsx from "clsx";

export type OpcaoChip = {
  value: string;
  label: string;
  // Valor "em branco" (Sem assessoria / Sem responsável) — desenhado em vinho para deixar claro
  // que ele NÃO é "não filtrar", e sim "só o que está sem preenchimento".
  vazio?: boolean;
};

// Grupo de chips de múltipla escolha do Relatório Personalizado.
//
// Regra que este componente materializa (ver lib/relatorioPersonalizado.ts): NÃO existe chip
// "Todos". Nenhum chip marcado já significa "não filtrar por esta dimensão" — por isso o rótulo
// mostra "todos" quando a seleção está vazia, em vez de obrigar um clique a mais para dizer a
// mesma coisa. Marcar tudo e não marcar nada produzem o mesmo relatório, de propósito.
export default function ChipsFiltro({
  rotulo,
  ajuda,
  opcoes,
  selecionados,
  onChange,
}: {
  rotulo: string;
  ajuda?: string;
  opcoes: OpcaoChip[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
}) {
  function alternar(value: string) {
    onChange(selecionados.includes(value) ? selecionados.filter((v) => v !== value) : [...selecionados, value]);
  }

  const vazio = selecionados.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-tx-2">{rotulo}</span>
        <span
          className={clsx(
            "text-[9.5px] font-bold px-1.5 py-px rounded-full border",
            vazio ? "bg-marca-bg text-marca-tx border-marca" : "bg-acao-bg text-acao border-transparent"
          )}
        >
          {vazio ? "todos" : `${selecionados.length} marcado${selecionados.length > 1 ? "s" : ""}`}
        </span>
        {!vazio && (
          <button type="button" onClick={() => onChange([])} className="text-[10.5px] font-semibold text-tx-3 hover:text-tx underline">
            limpar
          </button>
        )}
        {ajuda && <span className="text-[10.5px] text-tx-3">{ajuda}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const on = selecionados.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => alternar(o.value)}
              aria-pressed={on}
              // `atencao` é o apelido semântico do vinho que acompanha o tema (tailwind.config.ts);
              // a escala `vinho-*` é de tom fixo e não tem tom padrão, então `bg-vinho` não existe.
              // Sem modificador de opacidade aqui de propósito: cor definida como `var()` não gera
              // as variantes `/10` no CSS final — a classe sairia sem efeito nenhum.
              className={clsx(
                "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                on && o.vazio && "bg-atencao text-white border-transparent font-semibold",
                on && !o.vazio && "bg-acao text-acao-tx border-transparent font-semibold",
                !on && o.vazio && "border-atencao text-atencao bg-sf italic hover:bg-sf-apoio",
                !on && !o.vazio && "border-regua-forte bg-sf text-tx-2 hover:bg-sf-apoio"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
