// ============================================================================
// OS PARÂMETROS DE RECUSA DA ANA — quando ela encerra sozinha, e quando só propõe.
//
// Quatro eixos, e eles não são quatro coisas iguais. A diferença entre eles é a coisa inteira:
//
//   TRÊS DESENHAM O CONTORNO DO ESCRITÓRIO — matéria que ele não aceita, comarca fora do alcance,
//   valor de causa abaixo do mínimo. São fatos que não dependem do mérito de caso nenhum: ou a
//   causa é trabalhista e o escritório não faz trabalhista, ou não é. Não há o que julgar, e é por
//   isso — só por isso — que a Ana pode encerrar sozinha quando bate num deles.
//
//   O QUARTO NÃO É RECUSA. Documento que falta é ESPERA COM DATA. O escritório não está dizendo
//   não; está dizendo "sem isto eu não consigo olhar". Tratar falta de documento como recusa
//   transformaria em "não" definitivo o que é só um "ainda não", e o lead que ia mandar a carteira
//   de trabalho na segunda receberia uma carta de recusa no domingo.
//
// FORA DO CASO ÓBVIO, A ANA SÓ PROPÕE. Se o caso não bate exatamente num dos três contornos, ela
// não encerra: transfere com a proposta anotada e quem decide é gente. "Acho que não vale a pena"
// não é um contorno — é mérito, e mérito é ato de advogado.
//
// UM EIXO VAZIO NÃO É CRITÉRIO. O escritório que nunca abriu esta tela não recusa ninguém pela
// Ana, e isso é de propósito: o ato consciente que autoriza a máquina a dizer não em nome do
// escritório é o escritório TER ESCRITO o que não aceita. Nenhum padrão da plataforma entra aqui.
//
// E NADA DISTO REVOGA OS LIMITES DUROS (lib/agenteAtendimento.ts). A Ana não discute mérito e não
// promete resultado nem para recusar: "o escritório não atua nesta matéria" é contorno; "o seu caso
// não tem chance" é mérito, e ela não diz. A recusa dela é sempre sobre o ESCRITÓRIO, nunca sobre o
// CASO da pessoa.
// ============================================================================

/** Os três eixos que desenham o contorno, mais o que só espera. */
export const EIXOS = ["MATERIA", "COMARCA", "DOCUMENTO"] as const;
export type Eixo = (typeof EIXOS)[number];

/** Os eixos em que um acerto é recusa. DOCUMENTO não está aqui, e é a regra inteira deste arquivo. */
export const EIXOS_DE_RECUSA: Eixo[] = ["MATERIA", "COMARCA"];

export const rotuloDoEixo: Record<Eixo, string> = {
  MATERIA: "Matérias que o escritório não aceita",
  COMARCA: "Comarcas fora do alcance",
  DOCUMENTO: "Documentos sem os quais o caso não é analisado",
};

export const ajudaDoEixo: Record<Eixo, string> = {
  MATERIA: "Uma por linha, como o cliente falaria: “trabalhista”, “criminal”, “divórcio litigioso”.",
  COMARCA: "Uma por linha. A Ana encerra quando a pessoa disser que o caso corre numa delas.",
  DOCUMENTO: "Não é motivo de recusa: a Ana pede, marca uma data e o atendimento espera.",
};

export type Criterio = { id: string; eixo: string; valor: string; ordem: number };

export type ParametrosDaAna = {
  valorMinimoDaCausa: number | null; // centavos
  diasParaODocumento: number;
  criterios: Criterio[];
};

export const DIAS_PARA_O_DOCUMENTO_PADRAO = 15;
export const MAXIMO_DE_DIAS = 180;
export const TAMANHO_MAXIMO_DO_CRITERIO = 80;

// ── O QUE O ESCRITÓRIO ESCREVEU ──────────────────────────────────────────────

/** Os critérios de um eixo, na ordem em que o escritório os pôs. */
export function criteriosDoEixo(p: ParametrosDaAna, eixo: Eixo): Criterio[] {
  return p.criterios.filter((c) => c.eixo === eixo).sort((a, b) => a.ordem - b.ordem);
}

/**
 * A Ana pode encerrar sozinha?
 *
 * Só quando existe pelo menos UM contorno escrito. Repare no que NÃO conta: documento. Um
 * escritório que preencheu apenas a lista de documentos não autorizou recusa nenhuma — pediu
 * papel, e pedir papel é pedir, não é dizer não.
 */
export function podeRecusarSozinha(p: ParametrosDaAna): boolean {
  if (p.valorMinimoDaCausa != null && p.valorMinimoDaCausa > 0) return true;
  return EIXOS_DE_RECUSA.some((e) => criteriosDoEixo(p, e).length > 0);
}

/** Vale como critério de recusa? Nulo e zero não valem — ver a nota do schema. */
export function temValorMinimo(p: ParametrosDaAna): boolean {
  return p.valorMinimoDaCausa != null && p.valorMinimoDaCausa > 0;
}

// ── A VALIDAÇÃO DO QUE SE DIGITA ─────────────────────────────────────────────

export type Conferencia<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Um critério é UMA LINHA, e não um parágrafo.
 *
 * O limite de tamanho não é capricho de banco: este texto entra no pedido que a Ana lê, e um
 * escritório que cole ali três parágrafos de política interna faz a instrução de contorno competir
 * em volume com os limites duros. Contorno é lista; política é o campo de treinamento, que existe
 * e é outro.
 */
export function conferirCriterio(bruto: string, jaExistem: string[] = []): Conferencia<string> {
  const valor = (bruto || "").replace(/\s+/g, " ").trim();
  if (!valor) return { ok: false, erro: "Escreva o que a Ana deve procurar." };
  if (valor.length > TAMANHO_MAXIMO_DO_CRITERIO) {
    return { ok: false, erro: `No máximo ${TAMANHO_MAXIMO_DO_CRITERIO} caracteres — é uma linha, não um parágrafo.` };
  }
  // Comparação sem acento e sem caixa: "Trabalhista" e "trabalhista" repetidos na lista fariam a
  // Ana ler o mesmo contorno duas vezes, e a lista parecer maior do que a decisão que ela guarda.
  const achatar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (jaExistem.some((j) => achatar(j) === achatar(valor))) {
    return { ok: false, erro: "Este já está na lista." };
  }
  return { ok: true, valor };
}

/**
 * O valor mínimo digitado, em centavos.
 *
 * Aceita "15.000,00", "15000", "R$ 15.000" — porque é assim que se digita dinheiro no Brasil, e um
 * campo que só aceita um formato faz o escritório errar o piso por uma vírgula. Vazio devolve
 * `null`, que é "não uso este critério", e NÃO zero.
 */
export function conferirValorMinimo(bruto: string): Conferencia<number | null> {
  const limpo = (bruto || "").replace(/[R$\s]/gi, "").trim();
  if (!limpo) return { ok: true, valor: null };

  // "15.000,00" → "15000.00"; "15000" → "15000". O ponto só é separador de milhar quando há
  // vírgula depois dele; sem vírgula, "1.500" no Brasil é mil e quinhentos, não um e meio.
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return { ok: false, erro: "Valor inválido. Escreva assim: 15.000,00" };

  const centavos = Math.round(Number(normalizado) * 100);
  if (!Number.isFinite(centavos)) return { ok: false, erro: "Valor inválido. Escreva assim: 15.000,00" };
  if (centavos === 0) return { ok: true, valor: null };
  return { ok: true, valor: centavos };
}

export function conferirDiasDoDocumento(bruto: string | number): Conferencia<number> {
  const n = typeof bruto === "number" ? bruto : Number((bruto || "").trim());
  if (!Number.isInteger(n) || n < 1) return { ok: false, erro: "Escreva um número de dias a partir de 1." };
  if (n > MAXIMO_DE_DIAS) return { ok: false, erro: `No máximo ${MAXIMO_DE_DIAS} dias.` };
  return { ok: true, valor: n };
}

// ── O QUE SE MOSTRA ──────────────────────────────────────────────────────────

export function valorLegivel(centavos: number | null): string {
  if (centavos == null || centavos <= 0) return "sem piso";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A data até quando o atendimento espera o documento.
 *
 * Dias CORRIDOS, e a conta é feita sobre a data recebida sem tocar em hora: a data é dita ao
 * cliente no WhatsApp ("até dia 5") e ninguém conta dia útil de cabeça para conferir uma data que
 * uma máquina falou.
 */
export function prazoDoDocumento(de: Date, dias: number): Date {
  const d = new Date(de.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

// ── O QUE A ANA LÊ ───────────────────────────────────────────────────────────

/**
 * O bloco que entra no pedido ao agente.
 *
 * Devolve `null` quando não há nada escrito — e devolver null importa: um bloco vazio com títulos
 * ("AS MATÉRIAS QUE ESTE ESCRITÓRIO NÃO ACEITA:" e nada abaixo) convida um agente prestativo a
 * preencher a lacuna com o que ele imagina que o escritório não aceita.
 *
 * A ORDEM DAS FRASES É REGRA. Primeiro o que ela PODE encerrar, depois — sempre, mesmo sem
 * contorno nenhum — a frase que a impede de encerrar fora dali. Sem essa segunda frase, um agente
 * que leu "encerre quando for trabalhista" generaliza para "encerre quando parecer ruim".
 */
export function textoDosParametros(p: ParametrosDaAna): string | null {
  const partes: string[] = [];

  const materias = criteriosDoEixo(p, "MATERIA");
  const comarcas = criteriosDoEixo(p, "COMARCA");
  const documentos = criteriosDoEixo(p, "DOCUMENTO");

  if (materias.length > 0) {
    partes.push(
      "\nMATÉRIAS QUE ESTE ESCRITÓRIO NÃO ATENDE. Se o caso for claramente uma delas, encerre com educação, diga que o escritório não atua nessa área e termine a mensagem com a marca [[RECUSAR:MATERIA]]:",
      ...materias.map((c) => `- ${c.valor}`),
    );
  }
  if (comarcas.length > 0) {
    partes.push(
      "\nCOMARCAS FORA DO ALCANCE DESTE ESCRITÓRIO. Se a pessoa disser que o caso corre numa delas, encerre com educação, diga que o escritório não atua nessa comarca e termine com a marca [[RECUSAR:COMARCA]]:",
      ...comarcas.map((c) => `- ${c.valor}`),
    );
  }
  if (temValorMinimo(p)) {
    partes.push(
      `\nVALOR MÍNIMO DE CAUSA: ${valorLegivel(p.valorMinimoDaCausa)}. Se a própria pessoa disser um valor claramente abaixo disso, encerre com educação, diga que o escritório não consegue atender causas desse porte e termine com a marca [[RECUSAR:VALOR]]. NÃO estime o valor você: se ela não disser, não conclua nada.`,
    );
  }
  if (documentos.length > 0) {
    partes.push(
      `\nDOCUMENTOS SEM OS QUAIS O CASO NÃO É ANALISADO. Falta de documento NÃO É RECUSA: peça, diga que o atendimento fica guardado esperando, e termine com a marca [[AGUARDAR_DOCUMENTO]]. Nunca diga que o escritório não vai pegar o caso por falta de papel — o escritório tem ${p.diasParaODocumento} dias de espera para isso:`,
      ...documentos.map((c) => `- ${c.valor}`),
    );
  }

  // A trava, SEMPRE — inclusive quando não há contorno nenhum escrito acima.
  partes.push(
    "\nFORA DAS SITUAÇÕES ACIMA, VOCÊ NÃO ENCERRA NENHUM CASO. Se achar que este escritório talvez não deva pegar a causa por qualquer outro motivo, você NÃO diz isso à pessoa: termine com a marca [[PROPOR_RECUSA]] e escreva, na linha seguinte à marca, uma frase curta explicando ao escritório por quê. O sistema retira essa parte antes de enviar — a pessoa nunca a vê, e quem decide é o advogado.",
    "Ao encerrar, a recusa é SEMPRE sobre o escritório, nunca sobre o caso da pessoa: “não atuamos nessa área” pode; “o seu caso não tem chance” não pode, nem insinuado.",
  );

  return partes.length > 0 ? partes.join("\n") : null;
}
