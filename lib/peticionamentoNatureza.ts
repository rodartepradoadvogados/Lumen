// A NATUREZA DO PROCEDIMENTO — especificação §8 da adequação de 21/09/2026: "o agente IDENTIFICA
// a natureza a partir do contexto vinculado e mostra o porquê em texto [...] o advogado confirma
// ou corrige". Módulo PURO: recebe só os sinais do vínculo (nunca o Prisma inteiro) e devolve a
// dedução + o motivo em texto — a tela SEMPRE mostra este motivo, a dedução nunca é silenciosa.
//
// A régua é DETERMINÍSTICA, não passa pelo agente de IA (contrato-com-o-agente.md: dedução de
// dado estrutural é código, não prompt) — "processo" aqui significa Case do Lúmen; a diferença
// entre "processo judicial" e "processo administrativo" é a presença de número único E vara
// (um processo administrativo do escritório não tem vara, por definição).

export const NATUREZAS_DE_PROCEDIMENTO = ["processo judicial", "processo administrativo", "extrajudicial", "consultivo"] as const;

export type NaturezaDeProcedimento = (typeof NATUREZAS_DE_PROCEDIMENTO)[number];

export function ehNaturezaConhecida(valor: string | null | undefined): valor is NaturezaDeProcedimento {
  if (!valor) return false;
  return (NATUREZAS_DE_PROCEDIMENTO as readonly string[]).includes(valor);
}

export type SinalDeVinculoParaNatureza = {
  tipo: "case" | "attendance" | "assessoria";
  numeroProcesso?: string | null;
  vara?: string | null;
};

export type DeducaoDeNatureza = { natureza: NaturezaDeProcedimento | null; motivo: string };

/**
 * A ORDEM DE PRIORIDADE (mais específico primeiro): um processo com número E vara é o sinal mais
 * forte de "processo judicial" que existe no Lúmen — se a sessão tem vários vínculos, basta UM
 * assim para a dedução vencer sobre os demais tipos vinculados na mesma sessão.
 */
export function deduzirNatureza(vinculos: SinalDeVinculoParaNatureza[]): DeducaoDeNatureza {
  if (vinculos.length === 0) {
    return { natureza: null, motivo: "Sem vínculo selecionado ainda — escolha a natureza manualmente, ou vincule um item do Lúmen para o Peticionamento deduzir." };
  }

  const temProcessoComNumeroEVara = vinculos.some((v) => v.tipo === "case" && !!v.numeroProcesso && !!v.vara);
  if (temProcessoComNumeroEVara) {
    return { natureza: "processo judicial", motivo: "processo judicial, porque o vínculo tem número único e vara indicada." };
  }

  const temProcessoSemNumeroOuVara = vinculos.some((v) => v.tipo === "case" && !(v.numeroProcesso && v.vara));
  if (temProcessoSemNumeroOuVara) {
    return { natureza: "processo administrativo", motivo: "processo administrativo, porque o vínculo é um processo do escritório sem número e vara judicial completos." };
  }

  const temAssessoria = vinculos.some((v) => v.tipo === "assessoria");
  if (temAssessoria) {
    return { natureza: "consultivo", motivo: "consultivo, porque o vínculo é uma assessoria jurídica continuada." };
  }

  const temAtendimento = vinculos.some((v) => v.tipo === "attendance");
  if (temAtendimento) {
    return { natureza: "extrajudicial", motivo: "extrajudicial, porque o vínculo é um atendimento, sem processo formal indicado." };
  }

  return { natureza: null, motivo: "Não foi possível deduzir a natureza a partir deste vínculo — escolha manualmente." };
}
