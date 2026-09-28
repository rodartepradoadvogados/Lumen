import { ehSumulaTemaOuEnunciado, contemCnjValido } from "@/lib/peticionamentoIdentificadorDeJulgado";

// A GRADUAÇÃO DE FONTE E O GATE DE APROVAÇÃO FINAL — decisão do dono (23/09/2026), depois de o
// quadro "Citações desta minuta" ter mostrado três citações-molde com "fonte secundária: não
// informada pelo agente" e ainda assim oferecido "Li e revisei esta citação" para as três.
//
// Módulo PURO: só recebe os campos que precisa, nunca o registro do Prisma inteiro nem `sessaoId`
// — testável de mesa, sem banco. Quem GRAVA a aprovação é lib/actions/peticionamento.ts
// (aprovarMinutaGerarPeca); este módulo só CALCULA se pode.
//
// MUDANÇA DE RÉGUA (docs/agentes/peticionamento-firecrawl-validacao.md §4, 26/09/2026): a régua
// original (Passo 4 da skill pesquisa-jurisprudencia) tratava "só oficial, sem secundária" como
// CONDICIONAL — não bloqueava, a decisão ficava com o advogado. Isso deixou de bastar: a partir
// de agora, dupla validação com o link de CADA origem é requisito, não recomendação.
//
//   sem oficial                  → não cita. BLOQUEIA.
//   oficial sim, secundária não  → confirmada só no oficial. Antes era condicional; AGORA BLOQUEIA.
//   secundária sim, oficial não  → tratar como inexistente. BLOQUEIA.
//   as duas, mas alguma URL não passa na checagem de qualidade (§4.2)
//                                 → tratada como se a fonte que falhou não existisse. BLOQUEIA.
//   as duas, e as duas passam na checagem de qualidade
//                                 → completa. Não bloqueia.

export type ClassificacaoDeFonte = "sem-fonte" | "condicional" | "so-secundaria" | "completa" | "url-invalida";

export type AvaliacaoDeFonte = {
  classificacao: ClassificacaoDeFonte;
  /** true quando esta citação, sozinha, impede a aprovação final da minuta. */
  bloqueia: boolean;
  /** O rótulo que a tela mostra ao lado da citação — nunca "validada" nem "verificada" (decisão do dono). */
  rotulo: string;
};

function tentarParsear(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Nada de URL de busca (§4.2: "google.", "bing.", "?q=") — um link de busca não foi lido, é uma
 * lista de resultados que ainda precisa ser aberta. */
function ehUrlDeBusca(u: URL): boolean {
  const host = u.hostname.toLowerCase();
  if (host.includes("google.") || host.includes("bing.")) return true;
  return u.searchParams.has("q");
}

/**
 * §4.2 — a fonte OFICIAL precisa ser `https://` de um domínio `*.jus.br` (tribunais) ou
 * `planalto.gov.br`/`in.gov.br` (legislação). Domínio, não substring: `https://naojus.br.exemplo/`
 * não é `jus.br` só porque contém as letras.
 */
export function urlOficialValida(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = tentarParsear(url);
  if (!u || u.protocol !== "https:" || ehUrlDeBusca(u)) return false;
  const host = u.hostname.toLowerCase();
  const dominios = ["jus.br", "planalto.gov.br", "in.gov.br"];
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * §4.2 — a fonte SECUNDÁRIA precisa ser `https://`, de domínio DIFERENTE do da fonte oficial, e
 * NÃO pode ela mesma ser `*.jus.br` (duas páginas do mesmo tribunal, ou duas páginas do mesmo
 * portal, não são duas fontes independentes).
 */
export function urlSecundariaValida(url: string | null | undefined, urlOficial: string | null | undefined): boolean {
  if (!url) return false;
  const u = tentarParsear(url);
  if (!u || u.protocol !== "https:" || ehUrlDeBusca(u)) return false;
  const host = u.hostname.toLowerCase();
  if (host === "jus.br" || host.endsWith(".jus.br")) return false;
  const oficial = urlOficial ? tentarParsear(urlOficial) : null;
  if (oficial && host === oficial.hostname.toLowerCase()) return false;
  return true;
}

/**
 * Graduação de UMA citação pela presença/ausência de fonteUrl (oficial) e fonteSecundariaUrl
 * (secundária), e — quando as duas estão presentes — pela qualidade de cada URL (§4.2). Segue a
 * régua do Passo 4 da skill pesquisa-jurisprudencia, com a mudança de régua do §4 (26/09/2026).
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
      bloqueia: true,
      rotulo: "confirmada só no oficial; falta a fonte secundária independente; a peça não pode usar isto.",
    };
  }
  if (!temOficial && temSecundaria) {
    return {
      classificacao: "so-secundaria",
      bloqueia: true,
      rotulo: "achada só na fonte secundária, sem confirmação no oficial — tratada como inexistente; a peça não pode usar isto.",
    };
  }

  if (!urlOficialValida(fonteUrl)) {
    return {
      classificacao: "url-invalida",
      bloqueia: true,
      rotulo: "a fonte oficial informada não é um link https:// de um domínio oficial (tribunal ou legislação) — a peça não pode usar isto.",
    };
  }
  if (!urlSecundariaValida(fonteSecundariaUrl, fonteUrl)) {
    return {
      classificacao: "url-invalida",
      bloqueia: true,
      rotulo: "a fonte secundária não é independente (precisa ser https://, domínio diferente do oficial, e não pode ser outra página de tribunal) — a peça não pode usar isto.",
    };
  }
  return { classificacao: "completa", bloqueia: false, rotulo: "confirmada no oficial e na fonte secundária." };
}

export type CitacaoParaAprovacao = {
  confirmada: boolean;
  fonteUrl: string | null | undefined;
  fonteSecundariaUrl: string | null | undefined;
  /** O texto da citação — usado só para o gate de número CNJ (§3): súmula, tema e enunciado não
   * têm número de processo e ficam de fora dessa exigência (ver `ehSumulaTemaOuEnunciado`). */
  texto: string;
};

export type AvaliacaoDeAprovacao = {
  podeAprovar: boolean;
  motivos: string[];
};

/**
 * O GATE do botão final "Aprovar minuta / gerar peça" (decisão do dono): só libera quando TODAS
 * as citações ativas estão confirmadas pelo advogado, NENHUMA é bloqueante (molde devolvido pelo
 * agente, fonte insuficiente — ver `avaliarFonteDeCitacao`) E todo JULGADO citado (isto é, toda
 * citação que não é súmula/tema/enunciado) traz o número CNJ completo e válido no texto (§3). As
 * TRÊS condições são exigidas — faltando qualquer uma, `podeAprovar` é false. `motivos` nunca fica
 * vazio quando `podeAprovar` é false: a tela precisa dizer POR QUE, não só que não pode.
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
    motivos.push(`${bloqueantes} cita${bloqueantes === 1 ? "ção está" : "ções estão"} sem fonte oficial e secundária confirmadas — a peça não pode usá-las.`);
  }

  // §3 — número CNJ completo e válido é requisito para JULGADO (não para súmula/tema/enunciado,
  // que não têm número de processo). "REsp 1.234.567/SP" sozinho não basta: o número CNJ do
  // julgado tem de estar no texto da citação.
  const semCnj = dados.citacoes.filter((c) => !ehSumulaTemaOuEnunciado(c.texto) && !contemCnjValido(c.texto)).length;
  if (semCnj > 0) {
    motivos.push(`${semCnj} cita${semCnj === 1 ? "ção de julgado está" : "ções de julgado estão"} sem o número CNJ completo e válido — processo sem número completo no padrão CNJ não pode ser citado.`);
  }

  return { podeAprovar: motivos.length === 0, motivos };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ETAPA C — A APROVAÇÃO VIRA A TRAVA DA SAÍDA DA PEÇA.
//
// Exportar para Word, exportar para PDF e imprimir só ficam disponíveis DEPOIS que o advogado
// aprova a minuta. São DUAS travas, e as duas são exigidas — nenhuma substitui a outra:
//
//   - a APROVAÇÃO (PeticionamentoSessao.minutaAprovadaEm): o advogado disse "esta é a peça". Editar
//     o corpo depois desfaz a aprovação (lib/actions/peticionamento.ts:atualizarCorpoDaMinuta, e o
//     hard gate que varre toda gravação de minutaTexto);
//   - a CITAÇÃO PENDENTE: cada citação ativa com o "li e revisei" individual. Ela já era trava da
//     exportação antes desta etapa e continua sendo, independente da aprovação — hoje aprovar já
//     exige citações confirmadas, mas se amanhã alguém afrouxar a aprovação, a saída não afrouxa
//     junto.
//
// Uma função só decide para os três botões na tela e para a ação no servidor.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export type AvaliacaoDeSaida = {
  liberada: boolean;
  /** Nunca vazio quando `liberada` é false — a tela diz O QUE falta, não só que está bloqueado. */
  motivos: string[];
};

export function avaliarSaidaDaPeca(dados: { aprovada: boolean; citacoesPendentes: number | null }): AvaliacaoDeSaida {
  const motivos: string[] = [];
  if (!dados.aprovada) {
    motivos.push('a minuta ainda não foi aprovada — use "Aprovar minuta / gerar peça", no quadro de citações (editar o texto depois de aprovar desfaz a aprovação).');
  }
  if (dados.citacoesPendentes === null) {
    motivos.push("as citações ainda estão sendo conferidas.");
  } else if (dados.citacoesPendentes > 0) {
    const n = dados.citacoesPendentes;
    motivos.push(`ainda falta${n === 1 ? "" : "m"} confirmar ${n} cita${n === 1 ? "ção" : "ções"} — "li e revisei" é individual, uma por uma.`);
  }
  return { liberada: motivos.length === 0, motivos };
}
