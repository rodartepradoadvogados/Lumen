import { prisma } from "@/lib/prisma";
import { nomeDaLinha, ordenarPorEspera, type QuemEspera } from "@/lib/rotulosDaEspera";
import { lerJaTentaram } from "@/lib/filaDeTransferencia";

// Reexportado para que quem já importava daqui continue funcionando — e para que ninguém precise
// saber de cor em qual dos dois arquivos cada peça mora.
export * from "@/lib/rotulosDaEspera";

// ============================================================================
// QUEM ESTÁ ESPERANDO RESPOSTA — O LADO QUE CONSULTA O BANCO.
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

/**
 * Os status que NÃO são fila de espera.
 *
 * Rascunho é formulário pela metade. Convertido e arquivado já saíram de cena. E RECUSADO também:
 * o lead recusado continua existindo e pode voltar, mas enquanto a recusa está de pé ninguém está
 * esperando resposta dele — deixá-lo na fila faria a tela inicial do app cobrar uma resposta que
 * o escritório já decidiu não dar.
 */
const FORA_DA_FILA = ["RASCUNHO", "CONVERTIDO", "ARQUIVADO", "RECUSADO"];

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
    status: { notIn: FORA_DA_FILA },
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
