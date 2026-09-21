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

// ============================================================================
// O CORTE DENTRO DE UMA FERRAMENTA QUE NÃO É, INTEIRA, DO FINANCEIRO.
//
// `podeVerNivel` acima decide se uma FERRAMENTA inteira (módulo "financeiro") é oferecida. Mas o
// histórico do cliente (Q15 da entrevista do dono) não é uma ferramenta do financeiro — é uma
// ferramenta de cliente que, por dentro, TEM valores de dinheiro (o que já foi cobrado dele, o que
// ele já pagou). A régua é a mesma — "somar o que já está lançado é registro" —, mas ela corta
// dentro de UM CAMPO da resposta, e não a ferramenta inteira. O mesmo vale para qualquer outro
// bloco de valores dentro de uma ferramenta não financeira (ex.: o honorário mensal de uma
// assessoria).
//
// A REGRA, LITERAL: quem não tem acesso ao financeiro recebe a ferramenta INTEIRA — processos,
// atendimentos, tarefas, documentos —, só que SEM os valores; e a resposta tem de DIZER que
// omitiu. Nunca fingir que não há dinheiro no caso (silêncio), e nunca devolver o número. As duas
// falhas são igualmente graves: uma engana por omissão muda, a outra vaza.
// ============================================================================

export type OmissaoFinanceira = { omitido: true; motivo: string };

export const MOTIVO_OMISSAO_FINANCEIRA =
  "Valores financeiros omitidos: esta pessoa não tem acesso ao financeiro do escritório.";

/**
 * Aplica o corte de REGISTRO a um bloco de valores dentro de uma resposta maior.
 *
 * Nunca precisa de `admin`: somar o que já está lançado é sempre registro (nunca indicador),
 * então quem tem acesso ao financeiro — sócio ou não — vê. Quem não tem recebe uma omissão
 * FALANTE: `omitido: true` e o motivo por escrito, nunca um bloco vazio ou ausente que o agente
 * possa confundir com "não há valor" (a diferença entre "não sei" e "não tem" é exatamente o que
 * este objeto existe para preservar).
 */
export function valoresOuOmissao<T>(quem: QuemPergunta, valores: T): T | OmissaoFinanceira {
  if (podeVerNivel("registro", quem)) return valores;
  return { omitido: true, motivo: MOTIVO_OMISSAO_FINANCEIRA };
}
