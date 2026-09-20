import { prisma } from "@/lib/prisma";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";
import { pareceTelefone } from "@/lib/avisoDeLead";
import { lerJaTentaram } from "@/lib/filaDeTransferencia";

// ============================================================================
// QUEM ESTÁ ESPERANDO RESPOSTA.
//
// A pergunta que a tela inicial do app e a triagem fazem é a mesma, e por isso a resposta mora aqui
// uma vez só: de todos os atendimentos abertos, quais têm o cliente esperando — e há quanto tempo.
//
// A DEFINIÇÃO É SIMPLES DE PROPÓSITO: está esperando quando a ÚLTIMA mensagem da conversa é do
// cliente. Não é o status, não é o estágio do funil, não é o prazo gravado — é o fato bruto de que
// alguém escreveu e ninguém respondeu. Um atendimento pode estar "Em triagem" com tudo respondido,
// e pode estar "Convertido" com uma pergunta pendurada; o que conta para quem abre o app às onze
// da noite é a segunda coisa.
//
// A ORDEM É PELO TEMPO DE ESPERA, DO MAIOR PARA O MENOR. Ordenar por data de criação — que é o que
// as listas faziam — põe o lead de ontem que já foi respondido acima do que está esperando há
// quarenta minutos.
// ============================================================================

export type QuemEspera = {
  id: string;
  nome: string;
  /** A última mensagem, como ela aparece na lista: entre aspas, cortada pela tela. */
  ultimaMensagem: string | null;
  /** Minutos desde a última mensagem do cliente. Nulo quando não há ninguém esperando. */
  esperandoHa: number | null;
  /** A última palavra é do escritório — ninguém está esperando nesta conversa. */
  respondido: boolean;
  campanha: string | null;
  responsavel: string | null;
  /** Repassado a quem está olhando. Muda a cor da tarja, porque muda de quem é a obrigação. */
  meu: boolean;
  /** O prazo gravado, em ISO — o chip do relógio conta a partir dele, no navegador. */
  prazoISO: string | null;
  /** Qual volta da fila este lead está dando: 1ª, 2ª, 3ª. Ver lerJaTentaram. */
  voltaDaFila: number;
};

/** "11 min", "3h", "2d" — a espera em uma palavra, que é o que cabe na linha de uma lista. */
export function rotuloDaEspera(minutos: number | null): string | null {
  if (minutos === null) return null;
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}

/**
 * Do maior tempo de espera para o menor; quem já foi respondido vai para o fim.
 *
 * Empate resolvido pelo id, e não deixado ao acaso: sem critério final a lista troca de ordem entre
 * duas leituras do banco, e uma lista que se mexe sozinha é uma lista em que não se confia.
 */
export function ordenarPorEspera(a: QuemEspera, b: QuemEspera): number {
  if (a.esperandoHa === null && b.esperandoHa === null) return a.id.localeCompare(b.id);
  if (a.esperandoHa === null) return 1;
  if (b.esperandoHa === null) return -1;
  if (a.esperandoHa !== b.esperandoHa) return b.esperandoHa - a.esperandoHa;
  return a.id.localeCompare(b.id);
}

/** "1ª vez na fila", "3ª vez na fila" — quantas voltas este lead já deu sem ninguém responder. */
export function rotuloDaVolta(volta: number): string {
  return `${Math.max(1, volta)}ª vez na fila`;
}

/**
 * Com quem o lead está agora.
 *
 * Sem responsável NÃO é "ninguém": é a recepção, que é quem atende o que chega sem dono. Escrever
 * "sem responsável" aqui faria a fila parecer abandonada quando ela está exatamente onde deveria.
 */
export function comQuemEsta(q: QuemEspera): string {
  return q.responsavel || "Recepção";
}

/** Uma linha de contexto: de onde veio e de quem é. */
export function procedencia(q: QuemEspera): string {
  return [q.campanha || "sem campanha", q.meu ? "seu" : q.responsavel || "sem responsável"].join(" · ");
}

// ── O LADO DE IO ────────────────────────────────────────────────────────────

/**
 * Os atendimentos abertos do escritório, já ordenados por quem espera há mais tempo.
 *
 * `recorte` é o filtro por dono (lib/acessoAtendimento.ts, filtroDoAtendimento) — vem de fora, e
 * entra no WHERE. Quem só vê os próprios atendimentos nunca traz para a memória do servidor a
 * conversa do colega, nem para contar.
 *
 * Rascunho fica de fora: é formulário pela metade, não é gente esperando.
 */
export async function quemEstaEsperando(
  officeId: string,
  recorte: { responsibleId?: string },
  viewerId: string,
  agora: Date,
  limite = 50
): Promise<{ lista: QuemEspera[]; abertos: number }> {
  const where = {
    officeId,
    ...recorte,
    status: { notIn: ["RASCUNHO", "CONVERTIDO", "ARQUIVADO"] },
  };

  const [linhas, abertos] = await Promise.all([
    prisma.attendance.findMany({
      where,
      select: {
        id: true,
        clientName: true,
        waPhone: true,
        responsibleId: true,
        prazoDeRespostaAte: true,
        filaJaTentou: true,
        responsible: { select: { name: true } },
        campanha: { select: { nome: true } },
        // Só a última mensagem de cada conversa: é tudo o que a lista mostra, e trazer a conversa
        // inteira de cinquenta atendimentos para escolher uma linha seria desperdício por cinquenta.
        whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, body: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
    }),
    prisma.attendance.count({ where }),
  ]);

  const lista = linhas.map((l) => {
    const ultima = l.whatsappMessages[0];
    const esperando = ultima?.direction === "IN";
    return {
      id: l.id,
      nome: nomeDaLinha(l.clientName, l.waPhone),
      ultimaMensagem: ultima?.body?.trim() || null,
      esperandoHa: esperando ? Math.max(0, Math.floor((agora.getTime() - ultima.createdAt.getTime()) / 60_000)) : null,
      respondido: Boolean(ultima) && !esperando,
      campanha: l.campanha?.nome ?? null,
      responsavel: l.responsible?.name ?? null,
      meu: l.responsibleId === viewerId,
      prazoISO: l.prazoDeRespostaAte ? l.prazoDeRespostaAte.toISOString() : null,
      // Quem já teve a vez, mais o dono atual. Um lead que ninguém pegou ainda está na 1ª volta.
      voltaDaFila: lerJaTentaram(l.filaJaTentou).length + 1,
    };
  });

  return { lista: lista.sort(ordenarPorEspera), abertos };
}

/**
 * O nome que a lista mostra.
 *
 * Quando o WhatsApp não manda o nome do perfil, `clientName` nasce com o próprio número — e
 * "5562996142280" colado numa lista não é nome nem é telefone: é um dado que ninguém lê. Se o que
 * está ali é um número, ele é escrito como número.
 */
export function nomeDaLinha(clientName: string | null | undefined, waPhone: string | null | undefined): string {
  const nome = (clientName || "").trim();
  if (nome && !pareceTelefone(nome)) return nome;
  return telefoneLegivel(nome || waPhone) || "Sem nome";
}
