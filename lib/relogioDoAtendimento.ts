import { MINUTOS_PARA_RESPONDER, type GatilhoDaTransferencia } from "@/lib/filaDeTransferencia";
import { diaDeBrasilia, horaDeBrasilia, FUSO_DO_ESCRITORIO } from "@/lib/horaDeBrasilia";
import { POR_QUE_CHEGOU } from "@/lib/avisoDeLead";

// ============================================================================
// O RELÓGIO NO CABEÇALHO, E OS SEPARADORES DE DIA DA CONVERSA.
//
// Puro de propósito: são as duas coisas da tela do atendimento que mais fácil dão errado sem
// ninguém perceber — um relógio que conta ao contrário fora do expediente, e uma conversa em que
// "Hoje" aparece duas vezes porque o dia foi calculado no fuso do servidor.
//
// O PRAZO É UM INSTANTE GRAVADO (Attendance.prazoDeRespostaAte), e não um intervalo recalculado.
// A conta aqui é só a distância até ele. Isso tem uma consequência que a tela precisa dizer em voz
// alta: quando o prazo foi somado ATRAVESSANDO uma noite ou um fim de semana, a distância em
// minutos de relógio de parede é muito maior do que quinze — e mostrar "faltam 740 minutos" seria
// verdade e mentira ao mesmo tempo. Nesse caso o chip diz que o relógio está parado, porque é o
// que de fato está acontecendo: fora do expediente ninguém perde a vez.
// ============================================================================

export type EstadoDoRelogio =
  | { tipo: "sem-relogio" }
  | { tipo: "parado" }
  | { tipo: "correndo"; decorridos: number; faltam: number }
  | { tipo: "estourado"; atrasado: number };

/**
 * Onde o relógio de quinze minutos está, agora.
 *
 * `sem-relogio`  nunca começou, ou parou porque alguém respondeu.
 * `parado`       o prazo cai depois do expediente de hoje — a contagem está suspensa.
 * `correndo`     quantos minutos já se passaram e quantos faltam.
 * `estourado`    o prazo passou e o repasse ainda não rodou (o cron vem de cinco em cinco).
 */
export function estadoDoRelogio(prazo: Date | null | undefined, agora: Date, minutos = MINUTOS_PARA_RESPONDER): EstadoDoRelogio {
  if (!prazo) return { tipo: "sem-relogio" };

  const faltamMs = prazo.getTime() - agora.getTime();
  if (faltamMs <= 0) return { tipo: "estourado", atrasado: Math.max(1, Math.floor(-faltamMs / 60_000)) };

  const faltam = Math.ceil(faltamMs / 60_000);
  // Mais minutos do que o relógio inteiro só é possível se o prazo pulou para o expediente
  // seguinte. Aí não há "decorridos" que faça sentido mostrar.
  if (faltam > minutos) return { tipo: "parado" };

  return { tipo: "correndo", decorridos: minutos - faltam, faltam };
}

/** A linha grande do chip. */
export function tituloDoRelogio(e: EstadoDoRelogio): string {
  switch (e.tipo) {
    case "sem-relogio":
      return "";
    case "parado":
      return "Relógio parado";
    case "correndo":
      return `${e.decorridos} min sem resposta`;
    case "estourado":
      return "Prazo estourado";
  }
}

/** A linha pequena, abaixo. */
export function detalheDoRelogio(e: EstadoDoRelogio): string {
  switch (e.tipo) {
    case "sem-relogio":
      return "";
    case "parado":
      return "volta a contar na abertura do expediente";
    case "correndo":
      return `volta para a fila em ${e.faltam}`;
    case "estourado":
      return `há ${e.atrasado} min — vai ser repassado`;
  }
}

/**
 * A frase de sistema no meio da conversa, quando o lead foi transferido.
 *
 * Reaproveita POR_QUE_CHEGOU (lib/avisoDeLead.ts), que é o mesmo texto que o advogado recebeu no
 * WhatsApp. Duas redações para o mesmo fato — uma no aviso, outra na tela — são duas chances de
 * uma delas envelhecer sozinha.
 */
export function fraseDaTransferencia(
  gatilho: string | null | undefined,
  quando: Date | null | undefined,
  fuso: string = FUSO_DO_ESCRITORIO
): string | null {
  if (!quando) return null;
  const motivo = POR_QUE_CHEGOU[gatilho as GatilhoDaTransferencia];
  const hora = horaDeBrasilia(quando, fuso);
  if (!motivo) return `Esta conversa foi passada para o escritório às ${hora}.`;
  return `${motivo[0].toUpperCase()}${motivo.slice(1)} e o atendente passou esta conversa às ${hora}.`;
}

// ── OS SEPARADORES DE DIA ───────────────────────────────────────────────────

/**
 * O rótulo do separador: "Hoje", "Ontem" ou a data.
 *
 * Compara DIAS DE BRASÍLIA em texto ("2026-09-20"), e não instantes: às 22h de Brasília o servidor
 * em UTC já está no dia seguinte, e uma comparação por instante colocaria duas faixas "Hoje" na
 * mesma conversa — ou nenhuma.
 */
export function rotuloDoDia(quando: Date, agora: Date, fuso: string = FUSO_DO_ESCRITORIO): string {
  const dia = diaDeBrasilia(quando, fuso);
  const hoje = diaDeBrasilia(agora, fuso);
  if (dia === hoje) return "Hoje";

  const ontem = diaDeBrasilia(new Date(agora.getTime() - 86_400_000), fuso);
  if (dia === ontem) return "Ontem";

  const [ano, mes, d] = dia.split("-");
  // Ano só quando não é o corrente: "14/03" numa conversa deste ano não precisa dizer 2026.
  return hoje.slice(0, 4) === ano ? `${d}/${mes}` : `${d}/${mes}/${ano}`;
}

/**
 * Agrupa as mensagens em dias de Brasília, mantendo a ordem em que chegaram.
 *
 * Genérico no tipo da mensagem: a mesma função serve a conversa do site e a do app, e serve tanto
 * WhatsApp quanto e-mail, porque tudo que ela exige é um instante.
 */
export function agruparPorDia<T>(
  mensagens: T[],
  quandoDe: (m: T) => Date,
  agora: Date,
  fuso: string = FUSO_DO_ESCRITORIO
): { dia: string; rotulo: string; mensagens: T[] }[] {
  const grupos: { dia: string; rotulo: string; mensagens: T[] }[] = [];
  for (const m of mensagens) {
    const quando = quandoDe(m);
    const dia = diaDeBrasilia(quando, fuso);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.mensagens.push(m);
    else grupos.push({ dia, rotulo: rotuloDoDia(quando, agora, fuso), mensagens: [m] });
  }
  return grupos;
}
