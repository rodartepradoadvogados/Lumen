// A CAIXA DE SELEÇÃO + BUSCA da tela de contexto — pedido do dono, 22/09/2026, palavras dele:
// "Falta uma barra de pesquisa de processos, demandas... com caixa de seleção se é assessoria,
// processo judicial, extrajudicial, caso, atendimento. Se assessoria, pergunta se é processo
// vinculado, licitação, demanda. Ao lado, conforme o que se selecionou, abre para fazer busca,
// ao invés de ficar navegando em uma lista imensa de processos".
//
// Módulo PURO: só a TAXONOMIA e as regras de texto da busca. Nunca importa Prisma — quem
// consulta o banco é lib/actions/peticionamento.ts:buscarContextoParaVincular, que monta o
// `where` com officeId SEMPRE dentro dele.
//
// OS RÓTULOS NÃO FORAM INVENTADOS AQUI. Cada um é a entidade que existe de verdade no Lúmen:
//
//   · "processo judicial"       → Case com type JUDICIAL       (lib/caseNatureza.ts)
//   · "processo administrativo" → Case com type ADMINISTRATIVO (idem)
//   · "caso (extrajudicial)"    → Case com qualquer outro type (idem: naturezaOf agrupa
//                                 EXTRAJUDICIAL e os legados ATENDIMENTO/CONSULTIVO em "CASO",
//                                 e lib/relatorioPersonalizado.ts já rotula esse grupo como
//                                 "Caso (extrajudicial)"). O dono citou "extrajudicial" e "caso"
//                                 como duas opções; no Lúmen são UMA só, e oferecer as duas
//                                 separadas seria inventar uma divisão que o banco não tem —
//                                 duas opções que devolvem a mesma lista ensinam o advogado a
//                                 desconfiar do filtro. Em troca, o "processo administrativo"
//                                 (que existe de verdade e ele não citou) entra na lista.
//   · "atendimento"             → Attendance
//   · "assessoria"              → Assessoria, com a segunda pergunta que o dono pediu.
//
// A SEGUNDA PERGUNTA DA ASSESSORIA espelha as abas da própria tela de Assessoria do Lúmen
// (app/(app)/assessoria/[id]/page.tsx): "Licitações" e "Demandas, Processos e Casos" — onde
// "Demanda" é um Parecer (components/assessoria/ParecerCard.tsx: "Card + gaveta suspensa de uma
// demanda (Parecer)") e "Processo vinculado" é um Case com assessoriaId preenchido.

import type { TipoVinculo } from "./peticionamentoContexto";
import type { NaturezaDeProcedimento } from "./peticionamentoNatureza";

export type TipoDeBusca = "processo-judicial" | "processo-administrativo" | "caso" | "atendimento" | "assessoria";

/**
 * O QUE É VINCULADO NO FIM. A sessão só sabe vincular três coisas (PeticionamentoSessao:
 * vinculoCaseIds / vinculoAttendanceIds / vinculoAssessoriaIds) — procurar por licitação ou por
 * demanda é um jeito de ACHAR a assessoria, e o que entra na sessão é a assessoria dona daquela
 * licitação/demanda. A tela diz isso em texto na própria linha do resultado, nunca em silêncio.
 */
export type SubtipoDeAssessoria = "assessoria" | "processo-vinculado" | "licitacao" | "demanda";

export type OpcaoDeBusca<C extends string> = {
  chave: C;
  rotulo: string;
  /** O que isto É no Lúmen — vai para a tela, para ninguém ter que adivinhar o que o filtro faz. */
  explicacao: string;
  tipoVinculo: TipoVinculo;
};

export const TIPOS_DE_BUSCA: OpcaoDeBusca<TipoDeBusca>[] = [
  { chave: "processo-judicial", rotulo: "Processo judicial", explicacao: "Processos que tramitam no Poder Judiciário.", tipoVinculo: "case" },
  { chave: "processo-administrativo", rotulo: "Processo administrativo", explicacao: "Tribunal de contas, contencioso tributário, licitação, SEI.", tipoVinculo: "case" },
  { chave: "caso", rotulo: "Caso (extrajudicial)", explicacao: "Caso cadastrado sem processo formal em curso.", tipoVinculo: "case" },
  { chave: "atendimento", rotulo: "Atendimento", explicacao: "Atendimentos registrados na aba Atendimento.", tipoVinculo: "attendance" },
  { chave: "assessoria", rotulo: "Assessoria", explicacao: "Assessoria jurídica continuada — e o que vive dentro dela.", tipoVinculo: "assessoria" },
];

export const SUBTIPOS_DE_ASSESSORIA: OpcaoDeBusca<SubtipoDeAssessoria>[] = [
  { chave: "assessoria", rotulo: "A própria assessoria", explicacao: "Busca pela empresa assessorada.", tipoVinculo: "assessoria" },
  { chave: "processo-vinculado", rotulo: "Processo vinculado", explicacao: "Processo ou caso cadastrado dentro de uma assessoria.", tipoVinculo: "case" },
  { chave: "licitacao", rotulo: "Licitação", explicacao: "Vincula a assessoria dona da licitação encontrada.", tipoVinculo: "assessoria" },
  { chave: "demanda", rotulo: "Demanda", explicacao: "Pareceres da assessoria — vincula a assessoria dona da demanda.", tipoVinculo: "assessoria" },
];

/** O teto de linhas devolvidas por busca. A lista inteira NUNCA vai ao cliente — é o defeito que esta entrega existe para matar. */
export const LIMITE_DE_RESULTADOS = 25;

/**
 * Abaixo disto a busca não consulta o banco e devolve os mais recentes do tipo escolhido. Um
 * caractere só casaria com quase tudo, e o advogado leria uma lista imensa de novo — exatamente
 * o que ele pediu para acabar.
 */
export const MINIMO_DE_CARACTERES = 2;

export function normalizarTermo(termo: string | null | undefined): string {
  return (termo ?? "").trim().replace(/\s+/g, " ");
}

/** true quando o termo digitado já serve para filtrar; false = mostrar os mais recentes do tipo. */
export function termoEhBuscavel(termo: string | null | undefined): boolean {
  return normalizarTermo(termo).length >= MINIMO_DE_CARACTERES;
}

export function ehTipoDeBuscaConhecido(valor: string | null | undefined): valor is TipoDeBusca {
  if (!valor) return false;
  return TIPOS_DE_BUSCA.some((t) => t.chave === valor);
}

export function ehSubtipoConhecido(valor: string | null | undefined): valor is SubtipoDeAssessoria {
  if (!valor) return false;
  return SUBTIPOS_DE_ASSESSORIA.some((s) => s.chave === valor);
}

/**
 * O subtipo que VALE. Só existe subtipo dentro de "assessoria" — em qualquer outro tipo ele é
 * null, mesmo que a tela mande um (estado velho de um `useState` que não foi limpo ao trocar de
 * tipo é o defeito mais banal que existe numa tela de filtro; aqui ele morre antes do banco).
 * Dentro de assessoria, um subtipo desconhecido ou ausente cai em "assessoria" — a busca padrão,
 * nunca um erro na cara de quem só queria procurar.
 */
export function subtipoEfetivo(tipo: TipoDeBusca, subtipo: string | null | undefined): SubtipoDeAssessoria | null {
  if (tipo !== "assessoria") return null;
  return ehSubtipoConhecido(subtipo) ? subtipo : "assessoria";
}

/** O que de fato entra em PeticionamentoSessao quando o advogado marca um resultado desta busca. */
export function tipoVinculoDaBusca(tipo: TipoDeBusca, subtipo: string | null | undefined): TipoVinculo {
  const sub = subtipoEfetivo(tipo, subtipo);
  if (sub) return SUBTIPOS_DE_ASSESSORIA.find((s) => s.chave === sub)!.tipoVinculo;
  return TIPOS_DE_BUSCA.find((t) => t.chave === tipo)!.tipoVinculo;
}

/**
 * A COMPATIBILIZAÇÃO PEDIDA NO ITEM 4 (palavras do dono: "A seleção da natureza do procedimento
 * se confunde, em partes, com a caixa de seleção que expus acima, então deve ser compatibilizado").
 *
 * As duas perguntas SE TOCAM mas não são a mesma: a caixa de seleção é "o que eu estou
 * PROCURANDO", e a natureza é "o que este vínculo É". Quando há vínculo, quem responde a segunda
 * é a dedução (lib/peticionamentoNatureza.ts), a partir do vínculo — o advogado não responde nada.
 * Quando NÃO há vínculo nenhum (sessão avulsa), não há o que deduzir, e é só aí que a natureza
 * precisa ser escolhida à mão: esta tabela é o que a tela oferece em UM clique, reaproveitando a
 * resposta que ele já deu na caixa de seleção, em vez de perguntar a mesma coisa de novo.
 *
 * NUNCA grava sozinha: é sugestão de um clique, e o clique grava como confirmação MANUAL
 * (naturezaConfirmadaManualmente), que é a verdade — foi o advogado quem decidiu, não a dedução.
 *
 * `processo-vinculado` é null de propósito: um processo dentro de uma assessoria pode ser
 * judicial ou administrativo, e chutar aqui seria pior que não sugerir.
 */
export function naturezaSugeridaPelaBusca(tipo: TipoDeBusca, subtipo: string | null | undefined): NaturezaDeProcedimento | null {
  const sub = subtipoEfetivo(tipo, subtipo);
  if (sub === "processo-vinculado") return null;
  if (sub === "licitacao") return "processo administrativo";
  if (sub === "demanda" || sub === "assessoria") return "consultivo";
  if (tipo === "processo-judicial") return "processo judicial";
  if (tipo === "processo-administrativo") return "processo administrativo";
  if (tipo === "caso" || tipo === "atendimento") return "extrajudicial";
  return "consultivo";
}
