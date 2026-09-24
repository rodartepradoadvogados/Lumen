// A HEURÍSTICA DE TÍTULO E DE ALINHAMENTO DA MINUTA — uma implementação, dois consumidores.
//
// ── O QUE ELA É ───────────────────────────────────────────────────────────────────────────────
//
// Desde a primeira versão do gerador de .docx, o caminho do TEXTO PURO adivinha duas coisas que o
// texto puro não sabe dizer de si mesmo:
//
//   • TÍTULO DE SEÇÃO ("I — DOS FATOS"): parágrafo curto e em maioria de caixa alta → negrito.
//   • DATA E FECHO: a data de Goiânia e o ÚLTIMO parágrafo da peça → alinhados à direita.
//
// Ela nunca precisou ser perfeita: decide aparência, nunca some com texto.
//
// ── POR QUE ELA SAIU DE lib/peticionamentoDocx.ts PARA CÁ ─────────────────────────────────────
//
// Enquanto o Word era montado só do texto puro, a heurística acontecia INVISIVELMENTE, na hora de
// gerar o arquivo: o advogado nunca a via na tela, e ela nunca podia ser corrigida por ele.
//
// Com o editor da minuta, quem manda é a FOLHA (lib/peticionamentoDocxFormatado.ts não aplica
// heurística nenhuma, de propósito). Isso criou um rebaixamento silencioso: uma minuta ANTIGA, que
// nunca teve formatação gravada, bastava ser ABERTA E SALVA para passar a exportar um Word SEM o
// negrito do título e SEM a data à direita — porque na folha ela nunca teve nenhum dos dois. O
// advogado perdia produto de trabalho por só editar, e nada acusava.
//
// A decisão do dono foi "com o negrito": a SEMENTE da folha
// (lib/peticionamentoMinutaFormatada.ts: `htmlDaMinutaDoTextoPuro`) passa a nascer já com o que a
// heurística adivinhava escondido — agora VISÍVEL na tela e EDITÁVEL na barra.
//
// Daí este módulo. Os dois lados — o Word do texto puro e a semente da folha — precisam decidir
// IGUAL, e duas cópias da mesma regra divergiriam no primeiro dia em que alguém mexesse numa só.
// A divergência seria MUDA: o Word e a tela discordariam sem nenhum teste acusar, que é exatamente
// a classe de falha que esta casa já pagou caro (ver o cabeçalho de lib/testes/executar.ts). Por
// isso a regra mora AQUI, sozinha, e lib/testes/peticionamentoMinutaHeuristica.teste.ts varre o
// código provando que não nasceu uma segunda cópia.
//
// ── SEM IMPORTAÇÃO NENHUMA, DE PROPÓSITO ──────────────────────────────────────────────────────
//
// lib/peticionamentoDocx.ts importa de lib/peticionamentoDocxFormatado.ts, que importa de
// lib/peticionamentoMinutaFormatada.ts. Este módulo é folha da árvore: texto entra, classificação
// sai. Qualquer importação aqui abriria a porta para um ciclo entre os três.

/** O papel que a heurística atribui a um parágrafo do texto puro. */
export type PapelDoParagrafo = "titulo" | "direita" | "corpo";

/**
 * Os parágrafos de um texto puro de minuta, na forma que a heurística classifica.
 *
 * A DIVISÃO TAMBÉM MORA AQUI, e não só a classificação: "qual é o último parágrafo" depende de
 * como o texto foi dividido, e dois lados dividindo com regras próprias elegeriam últimos
 * parágrafos diferentes. `\n{2,}` é parágrafo e `\n` é quebra dentro do parágrafo — o mesmo
 * contrato que lib/peticionamentoMinutaFormatada.ts documenta para a derivação do texto puro.
 */
export function paragrafosDoTextoPuroDaMinuta(texto: string): string[] {
  return texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Título de seção ("I — DOS FATOS") ou parágrafo comum: curto e em maioria de caixa alta.
 *
 * Não precisa ser perfeita — só decide negrito e espaçamento, nunca some com texto. O limite de 90
 * caracteres e o corte em 70% de maiúsculas são os originais do gerador de .docx; mexer neles muda
 * o que sai em negrito nos DOIS lados de uma vez, que é justamente o ponto deste módulo.
 */
export function pareceTitulo(linha: string): boolean {
  const t = linha.trim();
  if (t.length === 0 || t.length > 90) return false;
  const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length === 0) return false;
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "");
  return maiusculas.length / letras.length > 0.7;
}

/**
 * O parágrafo vai à direita: a data de Goiânia (ou uma data em português no começo da linha) e o
 * ÚLTIMO parágrafo da peça, que é onde mora o fecho.
 *
 * A comparação com o último é POR VALOR, e não por índice — é o que o gerador de .docx sempre fez.
 * Consequência conhecida e preservada: um parágrafo repetido idêntico ao último também vai à
 * direita. Trocar por índice mudaria o Word de sessões antigas, que é o que esta entrega promete
 * não mexer.
 */
export function vaiParaADireita(paragrafo: string, paragrafos: readonly string[]): boolean {
  return paragrafo === paragrafos[paragrafos.length - 1] || /^goi[aâ]nia,|^\d{1,2} de [a-zç]+ de \d{4}/i.test(paragrafo);
}

/**
 * A DECISÃO ÚNICA por parágrafo — e a ORDEM entre as duas regras, que também não pode divergir.
 *
 * Título ganha negrito e NÃO ganha alinhamento à direita, mesmo quando ele é o último parágrafo da
 * peça. Quem chamasse `pareceTitulo` e `vaiParaADireita` em ordens diferentes nos dois lados
 * produziria telas e arquivos diferentes com a mesma regra — por isso a ordem está aqui dentro, e
 * os dois lados chamam ESTA função.
 */
export function papelDoParagrafoDaMinuta(paragrafo: string, paragrafos: readonly string[]): PapelDoParagrafo {
  if (pareceTitulo(paragrafo)) return "titulo";
  if (vaiParaADireita(paragrafo, paragrafos)) return "direita";
  return "corpo";
}
