// ============================================================================
// REGISTRO × INDICADOR — os dois níveis dentro do financeiro.
//
// A regra do dono, na letra dele: "somar o que já está lançado é REGISTRO; calcular o que ainda
// não existe é INDICADOR".
//
//   REGISTRO    contas a pagar e a receber, o que já foi pago, provisões, vencimentos, saldo.
//               Quem tem acesso ao financeiro vê. É consulta ao que está escrito no livro.
//
//   INDICADOR   faturamento, DRE, lucro, margem, inadimplência, ticket médio, projeção.
//               Só sócio. É leitura da SAÚDE do escritório, e saúde de escritório é assunto de
//               quem responde por ele.
//
// POR QUE A LINHA CAI EXATAMENTE AÍ. Quem paga as contas precisa saber o que vence amanhã — sem
// isso não faz o trabalho. Mas "qual foi nossa margem" e "quanto vamos faturar" não são dados de
// trabalho, são dados de sociedade: com eles se sabe quanto cada sócio tira, se o escritório está
// encolhendo, quanto vale o negócio. Dar isso a quem não é sócio não é generosidade, é vazamento.
//
// A LINHA NÃO É DE DIFICULDADE DE CÁLCULO. Somar as contas a receber de setembro dá um número
// grande e continua sendo registro: é o que está lançado. Dividir esse número pela quantidade de
// clientes é indicador, porque o ticket médio não está escrito em lugar nenhum — ele é produzido.
// ============================================================================

export type NivelFinanceiro = "registro" | "indicador";

/** O que o Lúmen sabe sobre quem fez a pergunta. Decidido pelo Lúmen, nunca pelo agente. */
export type QuemPergunta = {
  /** Administrador ou acesso expresso ao financeiro (a mesma regra que a tela usa). */
  financeiro: boolean;
  /** Sócio/dono do escritório. */
  admin: boolean;
};

/**
 * Pode ver?
 *
 * FECHADO POR PADRÃO e na ordem certa: sem acesso ao financeiro não passa nada, nem para sócio
 * que tivesse o acesso removido por engano. Só depois disso o nível é considerado.
 */
export function podeVerNivel(nivel: NivelFinanceiro, quem: QuemPergunta): boolean {
  if (!quem.financeiro) return false;
  return nivel === "registro" ? true : quem.admin;
}

/**
 * Por que não pôde — a frase que vai para a auditoria e para a resposta.
 *
 * Diz QUAL das duas portas fechou, porque as duas se resolvem de formas diferentes: a primeira um
 * administrador destrava em dois cliques na tela de Equipe; a segunda não se destrava, é uma
 * decisão de sociedade.
 */
export function motivoDaRecusa(nivel: NivelFinanceiro, quem: QuemPergunta): string | null {
  if (!quem.financeiro) return "usuário sem acesso ao financeiro";
  if (nivel === "indicador" && !quem.admin) return "indicador do escritório é restrito aos sócios";
  return null;
}

/** A frase que o agente devolve a quem perguntou. Sem jargão, e sem culpar quem perguntou. */
export function explicacaoDaRecusa(nivel: NivelFinanceiro, quem: QuemPergunta): string {
  if (!quem.financeiro) return "Esta pessoa não tem acesso ao financeiro do escritório.";
  if (nivel === "indicador" && !quem.admin) {
    return (
      "Os indicadores do escritório — faturamento, lucro, margem, inadimplência, ticket médio e projeção — " +
      "são restritos aos sócios. As contas a pagar e a receber continuam disponíveis normalmente."
    );
  }
  return "Consulta não autorizada.";
}
