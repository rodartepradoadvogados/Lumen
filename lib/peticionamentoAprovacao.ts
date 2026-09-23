// A GRADUAÇÃO DE FONTE E O GATE DE APROVAÇÃO FINAL — decisão do dono (23/09/2026), depois de o
// quadro "Citações desta minuta" ter mostrado três citações-molde com "fonte secundária: não
// informada pelo agente" e ainda assim oferecido "Li e revisei esta citação" para as três.
//
// Módulo PURO: só recebe os campos que precisa, nunca o registro do Prisma inteiro nem `sessaoId`
// — testável de mesa, sem banco. Quem GRAVA a aprovação é lib/actions/peticionamento.ts
// (aprovarMinutaGerarPeca); este módulo só CALCULA se pode.
//
// A GRADUAÇÃO É A REGRA DA CASA Nº 1 da skill servidor-hermes/skills/pesquisa-jurisprudencia
// (Passo 4), aplicada aqui como código, não repetida por conta própria:
//
//   sem oficial                  → não cita. BLOQUEIA.
//   oficial sim, secundária não  → condicional: "confirmada no oficial, sem confirmação
//                                   secundária" — segue, decisão é do advogado. NÃO bloqueia,
//                                   mas nunca se apresenta como validada.
//   secundária sim, oficial não  → tratar como inexistente. BLOQUEIA.
//   as duas                      → completa. Não bloqueia.

export type ClassificacaoDeFonte = "sem-fonte" | "condicional" | "so-secundaria" | "completa";

export type AvaliacaoDeFonte = {
  classificacao: ClassificacaoDeFonte;
  /** true quando esta citação, sozinha, impede a aprovação final da minuta. */
  bloqueia: boolean;
  /** O rótulo que a tela mostra ao lado da citação — nunca "validada" nem "verificada" (decisão do dono). */
  rotulo: string;
};

/**
 * Graduação de UMA citação pela presença/ausência de fonteUrl (oficial) e fonteSecundariaUrl
 * (secundária) — puramente derivada dos dois campos, nunca uma checagem própria do Lúmen contra
 * tribunal nenhum. Segue a régua do Passo 4 da skill pesquisa-jurisprudencia, literalmente.
 */
export function avaliarFonteDeCitacao(fonteUrl: string | null | undefined, fonteSecundariaUrl: string | null | undefined): AvaliacaoDeFonte {
  const temOficial = Boolean(fonteUrl);
  const temSecundaria = Boolean(fonteSecundariaUrl);

  if (!temOficial && !temSecundaria) {
    return {
      classificacao: "sem-fonte",
      bloqueia: true,
      rotulo: "sem fonte oficial nem secundária — o Passo 4 da pesquisa de jurisprudência manda não citar; a peça não pode usar isto.",
    };
  }
  if (temOficial && !temSecundaria) {
    return {
      classificacao: "condicional",
      bloqueia: false,
      rotulo: "confirmada no oficial, sem confirmação secundária — condicional; a decisão de usar é do advogado.",
    };
  }
  if (!temOficial && temSecundaria) {
    return {
      classificacao: "so-secundaria",
      bloqueia: true,
      rotulo: "achada só na fonte secundária, sem confirmação no oficial — tratada como inexistente; a peça não pode usar isto.",
    };
  }
  return { classificacao: "completa", bloqueia: false, rotulo: "confirmada no oficial e na fonte secundária." };
}

export type CitacaoParaAprovacao = {
  confirmada: boolean;
  fonteUrl: string | null | undefined;
  fonteSecundariaUrl: string | null | undefined;
};

export type AvaliacaoDeAprovacao = {
  podeAprovar: boolean;
  motivos: string[];
};

/**
 * O GATE do botão final "Aprovar minuta / gerar peça" (decisão do dono): só libera quando TODAS
 * as citações ativas estão confirmadas pelo advogado E NENHUMA é bloqueante (molde devolvido pelo
 * agente, ou citação sem fonte oficial). As DUAS condições são exigidas — faltando qualquer uma
 * das duas, `podeAprovar` é false. `motivos` nunca fica vazio quando `podeAprovar` é false: a
 * tela precisa dizer POR QUE, não só que não pode.
 */
export function avaliarAprovacaoDeMinuta(dados: { citacoes: CitacaoParaAprovacao[]; haAvisoDeMolde: boolean }): AvaliacaoDeAprovacao {
  const motivos: string[] = [];

  if (dados.haAvisoDeMolde) {
    motivos.push("o agente devolveu um molde ou número de exemplo em vez de um julgado — essa citação não pode entrar na peça.");
  }

  const pendentes = dados.citacoes.filter((c) => !c.confirmada).length;
  if (pendentes > 0) {
    motivos.push(`ainda falta${pendentes === 1 ? "" : "m"} confirmar ${pendentes} cita${pendentes === 1 ? "ção" : "ções"} — "li e revisei" é individual, uma por uma.`);
  }

  const bloqueantes = dados.citacoes.filter((c) => avaliarFonteDeCitacao(c.fonteUrl, c.fonteSecundariaUrl).bloqueia).length;
  if (bloqueantes > 0) {
    motivos.push(`${bloqueantes} cita${bloqueantes === 1 ? "ção está" : "ções estão"} sem fonte oficial confirmada — a peça não pode usá-las.`);
  }

  return { podeAprovar: motivos.length === 0, motivos };
}
