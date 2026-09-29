// Texto e tom da situação de prazo de um grupo de publicações — a mesma frase na linha da fila e no
// painel de leitura. Puro. O risco é SEMPRE ícone + texto + cor (nunca só cor), e só se afirma
// "vencido" com data extraída de confiança média ou alta; com confiança baixa a frase diz
// "possivelmente" e manda conferir.

import type { PrazoExtraido, SituacaoPrazo } from "@/lib/prazoExtraido";

export type TomPrazo = "venc" | "hoje" | "neutro" | "ok";

export type RotuloPrazo = { texto: string; detalhe?: string; tom: TomPrazo };

function dataBr(chave: string): string {
  const [a, m, d] = chave.split("-");
  return `${d}/${m}/${a}`;
}

function diasUteisTxt(n: number): string {
  return `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
}

export function rotuloPrazo(input: {
  prazo: PrazoExtraido;
  situacao: SituacaoPrazo;
  registrado: boolean;
  tratada: boolean;
}): RotuloPrazo {
  const { prazo, situacao, registrado, tratada } = input;
  if (tratada) return { texto: "Tratada", tom: "ok" };
  if (registrado) return { texto: "Prazo registrado", tom: "ok" };

  if (prazo.tipo === "CONFLITO") return { texto: "Prazo com números divergentes", detalhe: "confira na íntegra", tom: "hoje" };

  const quando = prazo.data ? dataBr(prazo.data) : "";
  const conferir = situacao.aConfirmar;
  const du = situacao.du;

  if (prazo.tipo === "EVENTO") {
    const hora = prazo.hora ? ` às ${prazo.hora}` : "";
    if (situacao.faixa === "cien") return { texto: "Evento já passou", detalhe: quando + hora, tom: "neutro" };
    if (du === 0) return { texto: "Evento hoje", detalhe: quando + hora, tom: "hoje" };
    return { texto: `Evento em ${diasUteisTxt(du ?? 0)}`, detalhe: quando + hora, tom: du != null && du <= 3 ? "hoje" : "neutro" };
  }

  switch (situacao.faixa) {
    case "venc":
      return {
        texto: `${conferir ? "Possivelmente vencido" : "VENCIDO"} há ${diasUteisTxt(-(du ?? 0))}`,
        detalhe: `prazo ${quando}${conferir ? ", confira" : ""}`,
        tom: "venc",
      };
    case "hoje":
      return { texto: conferir ? "Possivelmente vence hoje" : "VENCE HOJE", detalhe: `prazo ${quando}${conferir ? ", confira" : ""}`, tom: "hoje" };
    case "d3":
      return { texto: `Vence em ${diasUteisTxt(du ?? 0)}`, detalhe: `${quando}${conferir ? ", confira" : ""}`, tom: "hoje" };
    case "d15":
    case "dep":
      return { texto: `Vence em ${diasUteisTxt(du ?? 0)}`, detalhe: `${quando}${conferir ? ", confira" : ""}`, tom: "neutro" };
    case "cien":
      return { texto: "Só ciência", detalhe: "sem prazo no texto", tom: "neutro" };
    default:
      return { texto: "Prazo não identificado", detalhe: "confira na íntegra", tom: "neutro" };
  }
}

export const CONFIANCA_TXT: Record<number, string> = { 0: "nenhuma", 1: "baixa", 2: "média", 3: "alta" };
