import { estadoDoRelogio } from "@/lib/relogioDoAtendimento";
import type { EstadoDoChat } from "@/lib/estadoDoChat";

// ============================================================================
// A ANA NA LINHA DAS ABAS (33): a pílula "Ana: Ligada / Desligada / pausada" que abre uma confirmação. Sem React e sem
// banco: só o QUE a pílula diz, QUANDO o relógio de 15 min aparece nela e os TEXTOS EXATOS dos pop-ups (o dono os
// escolheu; o teste os trava). Nenhuma regra de acesso, de recorte ou de envio mora aqui — as ações são as mesmas de
// antes (`definirAtendenteResponde`, `devolverAtendenteResponde`, `responderUltimaPergunta`).
// ============================================================================

export type ModoDaAna = "ligada" | "desligada" | "pausada" | "indisponivel";

export type PilulaDaAna = {
  modo: ModoDaAna;
  /** O texto da pílula: "Ana: Ligada", "Ana: Desligada", "Ana: pausada". */
  rotulo: string;
  /** Só nos últimos 5 min do relógio de 15 ou vencido: "fila em 3 min" / "fila vencida". Fora disso, nada. */
  relogioCurto: string | null;
  /** O relógio por extenso para o title e o leitor de tela (também só quando grave). */
  relogioLongo: string | null;
  /** Ana ligada e o cliente esperando: o caminho "Responder agora" (menu da mensagem) e o 2º pop-up ao ligar. */
  podeResponderUltima: boolean;
};

export function pilulaDaAna(e: EstadoDoChat, agora: Date, nome: string): PilulaDaAna {
  const r = e.ultimaDirecao === "IN" ? estadoDoRelogio(e.prazoDeRespostaAte ? new Date(e.prazoDeRespostaAte) : null, agora) : null;
  let relogioCurto: string | null = null;
  let relogioLongo: string | null = null;
  if (r?.tipo === "correndo" && r.faltam <= 5) {
    relogioCurto = `fila em ${r.faltam} min`;
    relogioLongo = `${r.decorridos} min sem resposta; a conversa volta para a fila em ${r.faltam} min`;
  } else if (r?.tipo === "estourado") {
    relogioCurto = "fila vencida";
    relogioLongo = `Prazo de 15 min estourado há ${r.atrasado} min`;
  }
  const base = { relogioCurto, relogioLongo };
  if (!e.agenteAtivoNoEscritorio) return { ...base, modo: "indisponivel", rotulo: "Automático desligado", podeResponderUltima: false };
  if (e.agenteSilenciadoEm) return { ...base, modo: "pausada", rotulo: `${nome}: pausada`, podeResponderUltima: false };
  if (e.agenteResponde) return { ...base, modo: "ligada", rotulo: `${nome}: Ligada`, podeResponderUltima: e.ultimaDirecao === "IN" };
  return { ...base, modo: "desligada", rotulo: `${nome}: Desligada`, podeResponderUltima: e.ultimaDirecao === "IN" };
}

export type DialogoDaAna = "ligar" | "desligar" | "devolver" | "responder";

/** Qual pop-up a pílula abre: ligar (estava desligada), desligar (estava ligada), devolver (uma pessoa assumiu). */
export function dialogoDaPilula(modo: ModoDaAna): Exclude<DialogoDaAna, "responder"> | null {
  return modo === "desligada" ? "ligar" : modo === "ligada" ? "desligar" : modo === "pausada" ? "devolver" : null;
}

/** O 2º pop-up ("Responder à última mensagem?") só abre depois de LIGAR, e só se o cliente ficou esperando. */
export function abrirPerguntaDeResposta(e: Pick<EstadoDoChat, "ultimaDirecao">): boolean {
  return e.ultimaDirecao === "IN";
}

export function textosDoDialogo(d: DialogoDaAna, nome: string): { titulo: string; texto?: string; sim: string; nao: string } {
  switch (d) {
    case "ligar":
      return { titulo: `Ao ligar, a ${nome} passa a responder às mensagens automaticamente. Deseja ligar?`, sim: "Sim", nao: "Não" };
    case "desligar":
      return { titulo: `Ao desligar, a ${nome} não responderá às mensagens. Deseja desligar?`, sim: "Sim", nao: "Não" };
    case "devolver":
      // O texto que já existia em "Devolver à Ana" (BarraDoChat/ConfirmarDevolucao), agora com Sim/Não.
      return { titulo: `Devolver a conversa à ${nome}?`, texto: `Ela volta a responder a partir da PRÓXIMA mensagem do cliente. O que ficou sem resposta agora continua com você.`, sim: "Sim", nao: "Não" };
    case "responder":
      return { titulo: "Responder à última mensagem?", sim: "Sim", nao: "Não" };
  }
}
