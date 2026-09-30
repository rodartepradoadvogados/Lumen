// SELO DE CONTAGEM: ouro CHEIO com tinta escura (uma das poucas coisas em ouro cheio no app).
// Com `valor`, mostra o número (99+ acima de 99). Sem `valor`, é um PONTO de ouro: serve quando se sabe
// que há algo esperando mas não quantas (hoje, a "não lida" da lista é "esperando resposta": ver
// docs/ESTADO-ATUAL-E-ARMADILHAS.md). `rotulo` é o texto para leitor de tela.

export type SeloContagemProps = {
  valor?: number;
  rotulo: string;
  /** Posição sobre o ícone (canto superior direito do pai, que deve ser `relative`). */
  sobreIcone?: boolean;
  className?: string;
};

export function textoDoSelo(valor: number): string {
  return valor > 99 ? "99+" : String(Math.max(0, Math.floor(valor)));
}

export default function SeloContagem({ valor, rotulo, sobreIcone = false, className = "" }: SeloContagemProps) {
  const posicao = sobreIcone ? "absolute -right-1 -top-1.5" : "";
  if (valor === undefined) {
    return (
      <span data-selo="" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-atd-selo ${posicao} ${className}`}>
        <span className="sr-only">{rotulo}</span>
      </span>
    );
  }
  return (
    <span
      data-selo=""
      className={`inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-atd-selo px-1.5 text-app-meta font-bold tabular-nums text-atd-selo-tx ${posicao} ${className}`}
    >
      <span aria-hidden="true">{textoDoSelo(valor)}</span>
      <span className="sr-only">{`${valor} ${rotulo}`}</span>
    </span>
  );
}
