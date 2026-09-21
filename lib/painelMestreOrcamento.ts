// ============================================================================
// O ORÇAMENTO DO PEDIDO — mesma disciplina de lib/agenteAtendimento.ts (montarPergunta/
// LIMITE_DA_PERGUNTA), aplicada ao agente do Painel Mestre.
//
// O agente do escritório (F6) aprendeu isso do jeito caro: um pedido que cresce a cada camada
// nova, sem teto, um dia passa do limite que o outro lado aceita — e não com um erro visível, com
// SILÊNCIO. A Ana simplesmente parou de responder no WhatsApp; ninguém viu alerta nenhum. Este
// agente fala com a API da Anthropic direto (não com o servidor do Hermes, que é quem tem o
// PERGUNTA_MAXIMA de 16.000 caracteres citado na especificação) — o contexto do modelo aqui é bem
// maior. Isso NÃO é motivo para pular a disciplina: é motivo para ela custar barato e nunca faltar.
// Uma conversa de equipe interna que cresce sem controle ainda paga mais por token e ainda arrisca
// estourar o teto de tokens da chamada, só que mais tarde — "mais tarde" é exatamente o horário em
// que ninguém está olhando.
//
// A ORDEM DO QUE SE CORTA é a mesma regra de segurança do F6, não uma escolha de economia:
//   1. o HISTÓRICO, do turno mais ANTIGO para o mais novo;
//   2. NUNCA o texto fixo (regras do agente) nem a PERGUNTA DE AGORA — cortar isso faria o
//      agente "esquecer" uma trava sem avisar ninguém, e cortar a pergunta responderia a uma
//      pergunta diferente da que a pessoa fez.
//
// Se mesmo sem histórico nenhum o texto fixo + a pergunta de agora já estourar o orçamento, a
// função RECUSA — fala o motivo — em vez de cortar em silêncio um limite duro para caber.
// ============================================================================

export type TurnoDoPainelMestre = { role: "user" | "assistant"; texto: string };

/** Folga proposital sob o teto de tokens da chamada — ver o comentário acima sobre "mais tarde". */
export const LIMITE_DO_PEDIDO_PAINEL_MESTRE = 60_000;

export type OrcamentoDoPedido =
  | { cabe: true; historico: TurnoDoPainelMestre[] }
  | { cabe: false; motivo: string };

function tamanhoDoHistorico(historico: TurnoDoPainelMestre[]): number {
  // +10 de folga por turno para o "role" e a formatação — não precisa ser exato, só nunca
  // subestimar o suficiente para o corte parar cedo demais.
  return historico.reduce((soma, turno) => soma + turno.texto.length + 10, 0);
}

/**
 * Corta o histórico, do mais antigo para o mais novo, até o pedido inteiro (texto fixo +
 * histórico + pergunta de agora) caber no orçamento — ou devolve `cabe: false` quando nem
 * zerando o histórico ele cabe, porque aí o que sobra é só INEGOCIÁVEL (ver o comentário do
 * arquivo) e não há nada seguro para cortar.
 */
export function orcamentoDoPedido(input: {
  textoFixo: string;
  historico: TurnoDoPainelMestre[];
  pergunta: string;
}): OrcamentoDoPedido {
  const fixo = input.textoFixo.length + input.pergunta.length;
  if (fixo > LIMITE_DO_PEDIDO_PAINEL_MESTRE) {
    return {
      cabe: false,
      motivo: "Esta pergunta é longa demais para o agente processar. Encurte e tente de novo.",
    };
  }

  let historico = input.historico;
  while (historico.length > 0 && fixo + tamanhoDoHistorico(historico) > LIMITE_DO_PEDIDO_PAINEL_MESTRE) {
    historico = historico.slice(1);
  }
  return { cabe: true, historico };
}
