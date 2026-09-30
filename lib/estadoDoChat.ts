import { detalheDoRelogio, estadoDoRelogio, tituloDoRelogio } from "@/lib/relogioDoAtendimento";
import type { JanelaDoWhatsapp } from "@/lib/janelaDe24h";
import type { FixadaDoChat } from "@/lib/mensagemFixada";

// ============================================================================
// O ESTADO DA CONVERSA QUE O CHAT DO CELULAR PRECISA (sem banco, sem React) — e a BARRA DE ESTADO de uma
// linha só: quem responde (a Ana, uma pessoa, ninguém) + o relógio de 15 minutos + o controle.
//
// O ESTADO VIAJA EM TEXTO SIMPLES (datas em ISO) porque sai do servidor pela página e, depois, pela rota
// de atualização a cada 15 s — a barra e o campo de mensagem se redesenham com o que o servidor disse.
// ============================================================================

export type EstadoDoChat = {
  /** A chave da Ana NESTA conversa (`Attendance.agenteResponde`). */
  agenteResponde: boolean;
  /** Preenchido quando uma pessoa assumiu (`Attendance.agenteSilenciadoEm`). */
  agenteSilenciadoEm: string | null;
  /** O atendente automático está ligado neste escritório? Desligado, a chave da conversa não tem efeito. */
  agenteAtivoNoEscritorio: boolean;
  prazoDeRespostaAte: string | null;
  /** Direção da última mensagem ("IN" | "OUT") ou nula sem mensagens. */
  ultimaDirecao: "IN" | "OUT" | null;
  temWhatsapp: boolean;
  janela: { aberta: true } | { aberta: false; horasDesdeAUltimaEntrada: number | null };
  /** A mensagem fixada no topo (PR 10), ou nula. Opcional: quem monta o estado sem ela continua valendo. */
  fixada?: FixadaDoChat | null;
  /**
   * O provedor de WhatsApp do escritório ("META" | "EVOLUTION"), ou nulo sem configuração. Decide a LISTA de arquivos que o clipe
   * aceita (R3: a Meta recusa webp e zip, a Evolution aceita). Só orienta a tela: o servidor confere de novo.
   */
  provedor?: "META" | "EVOLUTION" | null;
};

export function montarEstadoDoChat(
  a: { agenteResponde: boolean; agenteSilenciadoEm: Date | null; prazoDeRespostaAte: Date | null; waPhone: string | null },
  ultimaDirecao: string | null,
  agenteAtivoNoEscritorio: boolean,
  janela: JanelaDoWhatsapp,
  fixada: FixadaDoChat | null = null,
  provedor: "META" | "EVOLUTION" | null = null,
): EstadoDoChat {
  return {
    agenteResponde: a.agenteResponde,
    agenteSilenciadoEm: a.agenteSilenciadoEm ? a.agenteSilenciadoEm.toISOString() : null,
    agenteAtivoNoEscritorio,
    prazoDeRespostaAte: a.prazoDeRespostaAte ? a.prazoDeRespostaAte.toISOString() : null,
    ultimaDirecao: ultimaDirecao === "IN" ? "IN" : ultimaDirecao === "OUT" ? "OUT" : null,
    temWhatsapp: Boolean(a.waPhone),
    janela,
    fixada,
    provedor,
  };
}

export type BarraDoChat = {
  /** "ana" = robô ligado; "pessoa" = uma pessoa assumiu (cadeado); "desligada" = ninguém automático. */
  icone: "ana" | "pessoa" | "desligada";
  titulo: string;
  /** Uma frase curta. Com o relógio correndo, é o relógio ("8 min sem resposta · volta para a fila em 7"). */
  frase: string;
  /** A frase inteira (com o relógio por extenso), para o tooltip e o leitor de tela. */
  fraseCompleta: string;
  /** Vermelha (nos últimos 5 minutos ou estourado). O texto também diz; a cor nunca fala sozinha. */
  grave: boolean;
  controle: "interruptor" | "devolver" | "nenhum";
  ligada: boolean;
};

/**
 * A barra de UMA LINHA. Antes eram duas faixas (uns 90 px); agora ícone + título + frase + controle,
 * e o relógio ocupa a frase. Quem assumiu ("Atendimento humano") tem prioridade sobre a chave: o
 * silêncio é o que `deveResponder` de fato lê, e a chave fica falsa quando uma pessoa envia.
 */
export function barraDoChat(e: EstadoDoChat, agora: Date, nomeDoAtendente: string): BarraDoChat {
  const b = barraSemFraseCompleta(e, agora, nomeDoAtendente);
  return { ...b.barra, fraseCompleta: b.longo ?? b.barra.frase };
}

function barraSemFraseCompleta(e: EstadoDoChat, agora: Date, nomeDoAtendente: string): { barra: Omit<BarraDoChat, "fraseCompleta">; longo: string | null } {
  // O relógio na frase da linha, em versão CURTA (a linha tem uma frase só, ao lado do controle):
  // "8 min sem resposta · fila em 7 min". O texto completo do relógio vem em `frase` do título (tooltip).
  const relogio = (() => {
    if (e.ultimaDirecao !== "IN") return null;
    const r = estadoDoRelogio(e.prazoDeRespostaAte ? new Date(e.prazoDeRespostaAte) : null, agora);
    if (r.tipo === "correndo") return { texto: `${r.decorridos} min sem resposta · fila em ${r.faltam} min`, longo: `${tituloDoRelogio(r)} · ${detalheDoRelogio(r)} min`, grave: r.faltam <= 5 };
    if (r.tipo === "estourado") return { texto: `${tituloDoRelogio(r)} · há ${r.atrasado} min`, longo: `${tituloDoRelogio(r)} · ${detalheDoRelogio(r)}`, grave: true };
    return null;
  })();

  if (!e.agenteAtivoNoEscritorio) {
    return { barra: { icone: "desligada", titulo: "Resposta automática desligada", frase: relogio?.texto ?? "O escritório não está usando o atendente automático.", grave: relogio?.grave ?? false, controle: "nenhum", ligada: false }, longo: relogio?.longo ?? null };
  }
  if (e.agenteSilenciadoEm) {
    return { barra: { icone: "pessoa", titulo: "Atendimento humano", frase: relogio?.texto ?? `${nomeDoAtendente} não responde mais aqui.`, grave: relogio?.grave ?? false, controle: "devolver", ligada: false }, longo: relogio?.longo ?? null };
  }
  if (e.agenteResponde) {
    return { barra: { icone: "ana", titulo: `${nomeDoAtendente} responde aqui`, frase: relogio?.texto ?? "Ao enviar, você assume e ela para.", grave: relogio?.grave ?? false, controle: "interruptor", ligada: true }, longo: relogio?.longo ?? null };
  }
  return { barra: { icone: "desligada", titulo: `${nomeDoAtendente} desligada aqui`, frase: relogio?.texto ?? "Ligar vale a partir da próxima mensagem do cliente.", grave: relogio?.grave ?? false, controle: "interruptor", ligada: false }, longo: relogio?.longo ?? null };
}
