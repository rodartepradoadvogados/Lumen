"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { estadoDoRelogio, tituloDoRelogio, detalheDoRelogio } from "@/lib/relogioDoAtendimento";

// ============================================================================
// O CHIP DO RELÓGIO, NO CABEÇALHO DO ATENDIMENTO.
//
// É CLIENTE, e o motivo é concreto: um chip renderizado no servidor diria "11 min sem resposta"
// para sempre, e a aba do navegador de um advogado fica aberta a manhã inteira. Um relógio que
// mostra a hora de quando a página carregou é pior do que nenhum relógio, porque é acreditado.
//
// A CONTA CONTINUA SENDO A MESMA (lib/relogioDoAtendimento.ts, estadoDoRelogio): o que chega aqui é
// o instante do prazo, e não um texto pronto. Assim a regra tem um só lugar e é testada sem
// navegador.
//
// DE TRINTA EM TRINTA SEGUNDOS. O relógio é de quinze minutos e mostra minutos inteiros; contar de
// segundo em segundo só gastaria bateria para redesenhar o mesmo texto.
// ============================================================================

export default function RelogioDoAtendimento({
  prazoISO,
  compacto = false,
  apenasDetalhe = false,
}: {
  prazoISO: string | null;
  /** Uma linha só, para o telefone — onde cada linha do cabeçalho é uma linha a menos de conversa. */
  compacto?: boolean;
  /**
   * Só a linha de baixo ("volta para a fila em 4"), sem moldura nem ícone. É o que a fila da
   * Triagem precisa: o tempo decorrido já está escrito ao lado, em coluna própria, e repetir a
   * moldura do chip em cada uma das linhas da tabela encheria a tela de caixas.
   */
  apenasDetalhe?: boolean;
}) {
  const prazo = prazoISO ? new Date(prazoISO) : null;
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    if (!prazo) return;
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
    // `prazoISO` é a dependência de verdade (o objeto Date é novo a cada render).
  }, [prazoISO]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prazo) return null;

  // Antes do primeiro efeito não há hora do cliente para usar, e usar a do servidor aqui traria de
  // volta a diferença de relógio que este componente existe para não ter. Uma batida de vazio é
  // invisível; um número errado, não.
  if (!agora) return null;

  const estado = estadoDoRelogio(prazo, agora);
  if (estado.tipo === "sem-relogio") return null;

  const grave = estado.tipo === "estourado" || (estado.tipo === "correndo" && estado.faltam <= 5);
  const cor = grave ? "text-marca-tx" : "text-tx-2";

  if (apenasDetalhe) return <>{detalheDoRelogio(estado)}</>;

  const moldura = grave ? "border-marca-tx/30 bg-marca-tx/[0.08]" : "border-regua bg-sf-apoio";

  if (compacto) {
    return (
      <div className={`flex min-w-0 items-center gap-2 border px-2.5 py-1.5 ${moldura}`}>
        <Clock size={14} className={`shrink-0 ${cor}`} strokeWidth={2.2} />
        <span className={`shrink-0 whitespace-nowrap text-corpo font-bold ${cor}`}>{tituloDoRelogio(estado)}</span>
        <span className="min-w-0 truncate text-corpo text-tx-2">— {detalheDoRelogio(estado)}</span>
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 items-center gap-2.5 border px-3.5 py-2.5 ${moldura}`}>
      <Clock size={18} className={`shrink-0 ${cor}`} strokeWidth={2.2} />
      <span className="block">
        <span className={`block text-sm font-bold leading-tight ${cor}`}>{tituloDoRelogio(estado)}</span>
        <span className="mt-0.5 block text-xs text-tx-2">{detalheDoRelogio(estado)}</span>
      </span>
    </div>
  );
}
