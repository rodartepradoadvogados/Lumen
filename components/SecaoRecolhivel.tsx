"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

// SEÇÃO RECOLHÍVEL — a gaveta dentro da gaveta.
//
// Pedido do dono na conferência visual de 17/09/2026: "em assessoria, dentro de uma assessoria,
// tanto no saas como no mobile, as seções devem ficar recolhidas em demandas, processos e casos,
// e expandir com clique."
//
// A aba "Demandas, Processos e Casos" empilhava as três listas abertas, uma embaixo da outra. Num
// contrato com 7 processos, 12 demandas e 9 atendimentos isso é uma página de rolagem antes de a
// pessoa saber o que existe ali — e o que ela quase sempre quer é UMA das três.
//
// Recolhida, a seção continua informando: o título carrega a contagem, então "Processos (7)" já
// responde a pergunta mais frequente sem abrir nada. Esse é o critério para uma seção poder nascer
// fechada — se o cabeçalho não disser quanta coisa tem dentro, fechar vira esconder.
//
// As ações (ordenar, novo, pesquisar) só aparecem com a seção aberta: um botão "Ordenar" flutuando
// ao lado de uma lista invisível não tem sobre o que agir.
export default function SecaoRecolhivel({
  titulo,
  contagem,
  acoes,
  inicialAberta = false,
  className = "",
  children,
}: {
  titulo: string;
  /** Quanta coisa tem dentro. Sem isto, recolher vira esconder — ver a nota acima. */
  contagem: number;
  /** Cluster de ações da seção; só renderiza com ela aberta. */
  acoes?: ReactNode;
  inicialAberta?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(inicialAberta);
  const idCorpo = useId();

  return (
    <div className={`bg-sf border border-regua ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          aria-expanded={aberta}
          aria-controls={idCorpo}
          className="flex items-center gap-2 min-h-[44px] -my-2 text-etiqueta font-bold uppercase tracking-wide text-tx-2 hover:text-tx transition-colors duration-100 ease-out"
        >
          <ChevronRight
            size={14}
            strokeWidth={2}
            aria-hidden="true"
            className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${aberta ? "rotate-90" : ""}`}
          />
          {titulo}
          <span className="tabular-nums font-semibold text-tx-3">({contagem})</span>
        </button>
        {aberta && acoes ? <div className="flex items-center gap-2 flex-wrap">{acoes}</div> : null}
      </div>
      {aberta ? (
        <div id={idCorpo} className="px-4 pb-4 animate-menu-desce origin-top">
          {children}
        </div>
      ) : null}
    </div>
  );
}
