// ============================================================================
// VALOR ESTIMADO DE ATENDIMENTO — registro de UM, indicador da SOMA.
//
// A regra do dono, agora aplicada ao pipeline comercial (Attendance.estimatedValue): "somar o
// que já está lançado é registro; calcular o que ainda não existe é indicador." A régua do
// financeiro (lib/nivelFinanceiro.ts) resolve essa mesma frase com DUAS travas — acesso ao
// financeiro e ser administrador — porque lá o registro (contas a pagar/receber) só é assunto de
// quem trabalha com dinheiro do escritório. Aqui a dobra é outra: o valor estimado de UM
// atendimento não é "o que está lançado no livro-caixa" — é a estimativa da negociação em curso,
// o dado de trabalho de quem está conduzindo aquele atendimento (inclusive a recepção, que não
// tem e não precisa ter acesso ao financeiro). Por isso ele é liberado por uma régua mais simples
// que a do financeiro: quem já enxerga aquele atendimento vê o valor dele, sem checagem extra.
//
//   REGISTRO    o valor estimado de UM atendimento. Quem já vê aquele atendimento (recepção,
//               responsável, quem abre a Triagem) vê o valor — é o que orienta a prioridade da
//               negociação, não um número de sociedade. `valorEstimadoIndividual` só normaliza o
//               tipo; não existe régua de admin para ele.
//
//   INDICADOR   a SOMA de vários valores estimados (por estágio do funil, por período, por
//               escritório inteiro). É projeção de receita que ainda não entrou — a mesma classe
//               de dado que DRE/faturamento/margem em lib/nivelFinanceiro.ts. Só administrador vê.
//
// NUNCA SILÊNCIO, NUNCA ZERO: quando a soma é omitida, a resposta diz que omitiu e por quê. Um
// bloco ausente ou um "R$ 0,00" no lugar do total escondido são a mesma falha da régua do
// financeiro (ver o comentário de `valoresOuOmissao`): fariam "omitido" e "não há nada estimado"
// parecerem a mesma coisa, e essa ambiguidade é o tipo de bug que vira chamado de suporte.
// ============================================================================

export type SomaEstimadaOuOmissao =
  | { omitido: true; motivo: string }
  | { omitido: false; total: number; quantidade: number };

export const MOTIVO_SOMA_ESTIMADA_OMITIDA =
  "Soma de valores estimados é projeção de receita futura (indicador) e só aparece para administradores.";

/**
 * O MESMO motivo, mais a instrução que só faz sentido para o agente — e que fecha um buraco que a
 * régua sozinha não fecha.
 *
 * O buraco: a régua impede o SISTEMA de somar, mas a ferramenta devolve até vinte valores
 * individuais (cada um legítimo por si, ver acima), e nada impede o agente de somá-los por conta
 * própria e apresentar o total a quem não é administrador. Numa tela isso exigiria alguém somando
 * à mão, card por card; para o agente a soma é de graça.
 *
 * Por isso a proibição viaja JUNTO com a omissão, dentro do próprio dado que o agente lê: é ali
 * que ela é útil. Não é garantia técnica — é da mesma natureza das outras instruções de
 * comportamento — e por isso ela acompanha a régua, nunca a substitui.
 */
export const AVISO_AO_AGENTE_NAO_SOMAR =
  `${MOTIVO_SOMA_ESTIMADA_OMITIDA} ` +
  "Não some você mesmo os valores individuais desta resposta para chegar a um total: quem perguntou " +
  "não pode receber essa soma. Se pedirem o total, diga que ele só aparece para administradores.";

/**
 * O portão, sozinho: fechado por padrão, e sem olhar valor nenhum antes de checar o perfil — quem
 * não é administrador nunca vê o total, nem para uma lista vazia, nem para uma soma já calculada
 * por fora (agregação no banco).
 */
function aplicarRegua(isAdmin: boolean, total: number, quantidade: number): SomaEstimadaOuOmissao {
  if (!isAdmin) return { omitido: true, motivo: MOTIVO_SOMA_ESTIMADA_OMITIDA };
  return { omitido: false, total, quantidade };
}

/**
 * Soma valores estimados de vários atendimentos que já estão em memória (ex.: os cards de uma
 * coluna do funil). É indicador, então só é calculada para administrador. Para qualquer outro
 * perfil devolve omissão FALANTE (`omitido: true` + motivo) em vez de somar às escondidas ou de
 * zerar: as duas falhas são igualmente graves, uma vaza e a outra mente por omissão.
 */
export function somaEstimadaOuOmissao(
  valores: Array<number | null | undefined>,
  opts: { isAdmin: boolean },
): SomaEstimadaOuOmissao {
  if (!opts.isAdmin) return aplicarRegua(false, 0, 0);
  const validos = valores.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const total = validos.reduce((acc, v) => acc + v, 0);
  return aplicarRegua(true, total, validos.length);
}

/**
 * Mesmo portão, para quando a soma já veio agregada do banco (`prisma....aggregate`) em vez de
 * somada em memória — o caso de uma ferramenta que precisa do total do UNIVERSO da consulta, não
 * só da amostra de 20 registros que ela mostra (ver o aviso sobre amostra em lib/assistantTools.ts).
 * `agregado` é `null` quando a agregação nem chegou a rodar (ex.: já se sabia de antemão que quem
 * perguntou não é administrador) — nesse caso omite do mesmo jeito, sem precisar de números reais.
 */
export function somaEstimadaAgregadaOuOmissao(
  agregado: { total: number; quantidade: number } | null,
  opts: { isAdmin: boolean },
): SomaEstimadaOuOmissao {
  if (!opts.isAdmin || !agregado) return aplicarRegua(false, 0, 0);
  return aplicarRegua(true, agregado.total, agregado.quantidade);
}

/**
 * Valor estimado de UM atendimento: normaliza o tipo vindo do banco (null/undefined/NaN viram
 * `null`). Nunca aplica régua de administrador — é registro de quem já enxerga aquele
 * atendimento, não indicador de sociedade.
 */
export function valorEstimadoIndividual(valor: number | null | undefined): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
