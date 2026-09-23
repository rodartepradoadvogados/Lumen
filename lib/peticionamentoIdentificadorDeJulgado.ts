// RECONHECEDOR DE FORMA de identificador de julgado — módulo puro, sem Prisma e sem rede. O
// Lúmen não sabe se um processo existe de verdade; ele só sabe dizer se o que o agente devolveu
// TEM FORMA de número real ou tem forma de MOLDE — o número de exemplo que sobra quando o agente
// preenche um modelo em vez de pesquisar de verdade (skill pesquisa-jurisprudencia, Passo 4: "não
// preencha o vazio com número de memória").
//
// O QUE MOTIVOU ESTE MÓDULO — quadro "Citações desta minuta" com estes três exemplos, nenhum dos
// três um julgado (print do dono, 23/09/2026):
//
//   TRT-18-RO-000XX-XX.20XX.5.18.XXXX   — máscara: X onde deveria haver dígito
//   TST-RR-XXXXX-XX.20XX.5.XX.XXXX      — a mesma máscara, outro tribunal
//   STJ-REsp-1.234.567/SP               — não é máscara, é o número de EXEMPLO clássico do
//                                          direito brasileiro (sequência 1-2-3-4-5-6-7) — não
//                                          identifica julgado nenhum
//
// O QUE ESTE MÓDULO NÃO FAZ: não confirma que o número existe, não consulta tribunal nenhum. Ele
// classifica só a FORMA, e com régua deliberadamente estreita: qualquer coisa que não seja
// claramente molde nem claramente um número real cai em "irreconhecível" — nunca em "válido" por
// omissão. Errar para "irreconhecível" é seguro (o texto segue como trecho comum, sem virar
// citação estruturada); errar para "válido" reintroduziria exatamente o risco que isto corta.

export type ClassificacaoDeIdentificador = "valido" | "molde" | "irreconhecivel";

export type IdentificadorAchado = {
  /** O texto exato do identificador encontrado, como apareceu na fonte — nunca normalizado. */
  trecho: string;
  classificacao: ClassificacaoDeIdentificador;
};

/** X, N ou "_" numa posição de dígito — os três símbolos de molde citados pelo dono como exemplo. */
const CONTEM_MASCARA = /[XN_]/;

// Segmento CNJ tolerante a máscara: a mesma forma de NNNNNNN-DD.AAAA.J.TR.OOOO, mas aceitando
// X/N/_ no lugar do dígito — é exatamente isso que um molde devolve. Primeiro segmento com faixa
// 4–7 (não só 7): um molde ABREVIADO ("000XX", 5 caracteres) não respeita a contagem real de 7
// dígitos, e recusar por contagem deixaria passar o molde mais óbvio dos exemplos do dono.
const RE_CNJ_OU_MOLDE =
  /([0-9XN_]{4,7})\s*-\s*([0-9XN_]{2})\s*\.\s*([0-9XN_]{4})\s*\.\s*([0-9XN_])\s*\.\s*([0-9XN_]{2})\s*\.\s*([0-9XN_]{4})/g;

// Recurso/ação + número, tolerante a máscara e ao hífen que a forma "TRIBUNAL-RECURSO-numero" usa
// no lugar do espaço ("STJ-REsp-1.234.567/SP"). Mesma lista de siglas de RE_RECURSO
// (lib/peticionamentoCitacoes.ts) — deliberadamente SEM acrescentar sigla nova aqui: o exemplo do
// TRT/TST já é pego inteiro pelo padrão CNJ acima (o número é que é o molde, não a sigla do
// recurso), e uma sigla curta a mais (como "RO", que também é a UF de Rondônia) só aumentaria o
// risco de falso positivo sem cobrir nenhum caso a mais.
const RE_RECURSO_OU_MOLDE =
  /\b(AREsp|EAREsp|REsp|ADPF|ADC|ADI|RHC|RMS|AgRg|AgInt|EDcl|ARE|RE|HC|MS|Ag)\b[.\s-]*n?[ºo°:.]*[.\s-]*([0-9XN_][0-9XN_.]*)(?:\/[A-Za-z]{2})?/g;

// Fallback para um identificador ISOLADO que não carrega palavra-chave nem tem a forma CNJ
// completa (o "0000000-00" do exemplo do dono) — só dispara quando o CANDIDATO INTEIRO, tirando
// espaço nas pontas, é apenas dígito/máscara com os separadores de número de processo
// ("-", ".", "/"). Nunca aplicado a um texto maior: existe só para classificar um identificador
// já isolado, que é o uso dos testes de mesa desta casa.
const RE_SO_NUMERO = /^\s*([0-9XN_](?:[0-9XN_./-]*[0-9XN_])?)\s*$/;

function apenasDigitosOuMascara(...partes: string[]): string {
  return partes.join("").replace(/[^0-9XN_]/g, "");
}

/**
 * Sequência trivial: todo o mesmo dígito repetido (o "0000000-00" do exemplo do dono), ou uma
 * corrida estritamente crescente/decrescente cobrindo a string INTEIRA (o "1.234.567" do exemplo
 * — dígitos 1-2-3-4-5-6-7). Cobrir só a string INTEIRA, e não um pedaço dela, é deliberado: um
 * número real pode ter um TRECHO ascendente por acaso ("...123..."), mas a chance de o número
 * inteiro ser uma progressão perfeita de ponta a ponta é a marca do exemplo de manual, não de um
 * processo de verdade.
 */
function ehSequenciaTrivial(digitos: string): boolean {
  if (digitos.length < 3) return false;
  if (/^(\d)\1+$/.test(digitos)) return true;
  let crescente = true;
  let decrescente = true;
  for (let i = 1; i < digitos.length; i++) {
    const a = Number(digitos[i - 1]);
    const b = Number(digitos[i]);
    if (b !== (a + 1) % 10) crescente = false;
    if (b !== (a + 9) % 10) decrescente = false;
  }
  return crescente || decrescente;
}

function classificarDigitos(digitos: string): "valido" | "molde" {
  if (!digitos) return "molde";
  if (CONTEM_MASCARA.test(digitos)) return "molde";
  if (ehSequenciaTrivial(digitos)) return "molde";
  return "valido";
}

/**
 * Igual a `classificarDigitos`, mas para os SEIS SEGMENTOS separados do CNJ — precisa disto além
 * da checagem sobre o texto concatenado porque "0000000-00" (o exemplo do dono) só é "todo o mesmo
 * dígito" DENTRO do primeiro segmento: uma vez concatenado com ano/tribunal/unidade de verdade
 * (dígitos plausíveis, não triviais), a string INTEIRA deixa de ser uma sequência trivial, e o
 * molde mais na cara dos três (número de processo zerado) escaparia da checagem única.
 */
function classificarSegmentosCnj(segmentos: string[]): "valido" | "molde" {
  const concatenado = apenasDigitosOuMascara(...segmentos);
  if (classificarDigitos(concatenado) === "molde") return "molde";
  if (segmentos.some((s) => ehSequenciaTrivial(s.replace(/[^0-9XN_]/g, "")))) return "molde";
  return "valido";
}

/**
 * Classifica um IDENTIFICADOR ISOLADO (não uma frase inteira) — usado pelos testes de mesa e por
 * quem já isolou o candidato antes de perguntar. Tenta, nesta ordem: forma CNJ (com ou sem
 * máscara), recurso/ação + número (com ou sem máscara), e por fim um número solto sem palavra-
 * chave. Nenhuma das três formas reconhecida → "irreconhecível", nunca "válido" por omissão.
 */
export function classificarIdentificador(candidato: string): ClassificacaoDeIdentificador {
  const texto = (candidato ?? "").trim();
  if (!texto) return "irreconhecivel";

  const cnj = new RegExp(RE_CNJ_OU_MOLDE.source, "g").exec(texto);
  if (cnj) return classificarSegmentosCnj([cnj[1], cnj[2], cnj[3], cnj[4], cnj[5], cnj[6]]);

  const recurso = new RegExp(RE_RECURSO_OU_MOLDE.source, "g").exec(texto);
  if (recurso) return classificarDigitos(apenasDigitosOuMascara(recurso[2]));

  const soNumero = RE_SO_NUMERO.exec(texto);
  if (soNumero) return classificarDigitos(apenasDigitosOuMascara(soNumero[1]));

  return "irreconhecivel";
}

/**
 * Varre um TEXTO MAIOR (a ementa inteira devolvida pelo agente, ou o corpo da minuta) atrás de
 * identificadores embutidos — é assim que "TRT-18-RO-000XX-XX.20XX.5.18.XXXX — Contrato de gestão
 * com metas objetivas..." é pego: o molde está no MEIO da frase, a frase inteira não é um
 * identificador isolado (por isso classificarIdentificador sozinho não bastaria aqui).
 */
export function encontrarIdentificadoresNoTexto(texto: string | null | undefined): IdentificadorAchado[] {
  if (!texto) return [];
  const achados: IdentificadorAchado[] = [];
  const vistos = new Set<string>();

  const reCnj = new RegExp(RE_CNJ_OU_MOLDE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = reCnj.exec(texto))) {
    if (m[0].length === 0) {
      reCnj.lastIndex++;
      continue;
    }
    const trecho = m[0].trim();
    if (!trecho || vistos.has(trecho)) continue;
    vistos.add(trecho);
    achados.push({ trecho, classificacao: classificarSegmentosCnj([m[1], m[2], m[3], m[4], m[5], m[6]]) });
  }

  const reRecurso = new RegExp(RE_RECURSO_OU_MOLDE.source, "g");
  while ((m = reRecurso.exec(texto))) {
    if (m[0].length === 0) {
      reRecurso.lastIndex++;
      continue;
    }
    const trecho = m[0].trim();
    if (!trecho || vistos.has(trecho)) continue;
    vistos.add(trecho);
    achados.push({ trecho, classificacao: classificarDigitos(apenasDigitosOuMascara(m[2])) });
  }

  return achados;
}

/** O achado de molde mais LONGO (o mais completo/claro para mostrar ao advogado), ou null se não houver nenhum. */
export function piorMoldeNoTexto(texto: string | null | undefined): IdentificadorAchado | null {
  const moldes = encontrarIdentificadoresNoTexto(texto).filter((a) => a.classificacao === "molde");
  if (moldes.length === 0) return null;
  return moldes.reduce((pior, atual) => (atual.trecho.length > pior.trecho.length ? atual : pior));
}
