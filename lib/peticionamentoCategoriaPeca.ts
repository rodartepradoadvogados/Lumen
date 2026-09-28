// A PRIMEIRA PERGUNTA da sessão — especificação §7 da adequação de 21/09/2026: "o nome da aba
// continua Peticionamento [mas] a primeira pergunta passa a ser o tipo". Lista FECHADA, escolhida
// antes até da tela de contexto (app/peticionamento/[id]/tipo/page.tsx).
//
// Não confundir com lib/peticionamentoTipoPeca.ts: aquele é a sublista (Inicial, Contestação,
// Réplica, Apelação...) que só faz sentido quando a categoria escolhida aqui é "Petição" — as
// demais categorias (Contrato, Parecer, Notificação Extrajudicial, Geral) não têm essa sublista.
//
// "Geral" (decisão do dono, 22/09/2026): a QUINTA categoria, para quando o próprio advogado não
// sabe classificar o que precisa. É o caso PRINCIPAL desta categoria, não sobra — palavras do
// dono: "o geral deve ter mais orientações para o agente identificar melhor". Por isso o
// questionário dela (lib/peticionamentoQuestionario.ts) pergunta MAIS, nunca menos, e o prompt ao
// agente (lib/peticionamentoPrompt.ts) carrega orientação extra para deduzir o tipo certo.

export const CATEGORIAS_DE_PECA = ["Petição", "Contrato", "Parecer", "Notificação Extrajudicial", "Geral"] as const;

export type CategoriaDePeca = (typeof CATEGORIAS_DE_PECA)[number];

export function ehCategoriaConhecida(valor: string | null | undefined): valor is CategoriaDePeca {
  if (!valor) return false;
  return (CATEGORIAS_DE_PECA as readonly string[]).includes(valor);
}

/** Só a categoria "Petição" usa a sublista de lib/peticionamentoTipoPeca.ts (Inicial, Contestação...). */
export function usaSublistaDeTipoDePeticao(categoriaPeca: string | null | undefined): boolean {
  return categoriaPeca === "Petição" || !categoriaPeca; // sem categoria escolhida ainda: mantém o comportamento anterior à adequação (sublista visível)
}

/**
 * O RÓTULO exibido na tela — pedido do dono, 24/09/2026 (item 1): "notificação (tire o
 * extrajudicial do nome)". O VALOR canônico (o que fica salvo em
 * PeticionamentoSessao.categoriaPeca, o que entra no prompt ao agente em
 * lib/peticionamentoPrompt.ts e o que lib/peticionamentoQuestionario.ts usa para escolher a
 * configuração do questionário) continua "Notificação Extrajudicial" DE PROPÓSITO: mudar o valor
 * armazenado tornaria "desconhecida" (ehCategoriaConhecida) qualquer sessão JÁ CRIADA com essa
 * categoria antes desta entrega — quebrando, em silêncio, tudo que lê esse campo numa sessão
 * antiga (retomar rascunho, questionário, geração da minuta). Só a ETIQUETA muda; ver a prova
 * disso em lib/testes/peticionamentoNavegacao.teste.ts.
 *
 * Aceita `string` solta (não só `CategoriaDePeca`) de propósito: uma sessão antiga com um valor
 * fora da lista atual (ou nula, em quem chama já filtra) ainda precisa de ALGUM texto para
 * mostrar — a função só troca o UM valor que conhece e devolve o resto como veio.
 */
export function rotuloCategoriaPeca(categoria: string): string {
  return categoria === "Notificação Extrajudicial" ? "Notificação" : categoria;
}
