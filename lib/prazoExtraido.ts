// Prazo extraído do TEOR de uma publicação (substitui o antigo prazoSugerido.ts, que somava 15 dias
// úteis a qualquer publicação — 16 de 19 publicações que traziam o prazo escrito no texto mostravam
// uma data errada, quase sempre mais tardia que a do próprio texto).
//
// Puro (sem Prisma, sem I/O): recebe o texto, o tipo (PUBLICACAO/ANDAMENTO), a data em que saiu e os
// feriados extras do escritório, e devolve o que o TEXTO diz — nunca o que "provavelmente" é. Três
// regras de transparência, todas testadas em lib/testes/prazoExtraido.teste.ts:
//   1. Só há data quando o texto traz um número de dias (ou uma data de audiência escrita). Sem número,
//      `data` fica ausente — nunca se inventa prazo.
//   2. A confiança (0 a 3) vem sempre com o motivo em texto (`notas`) e o trecho exato de origem
//      (`trecho`), para o advogado conferir na íntegra.
//   3. Nada aqui preenche Task.dueDate: o resultado é SUGESTÃO. Quem grava o prazo é o advogado, com um
//      gesto explícito ("Usar sugestão" no modal de tarefa).
//
// Regra de contagem: `addDiasUteis` de lib/prazos.ts (não conta a data de partida; pula fim de semana,
// feriado nacional, feriado extra do escritório e recesso do CPC art. 220), a partir do DIA DE
// BRASÍLIA da publicação. Em intimação eletrônica o início pode ser a data da ciência ou da
// disponibilização mais um dia útil — a tela manda o advogado conferir (ver "Como calculamos").

import { saoPauloDayKey } from "@/lib/publicationGrouping";
import { addDiasCorridos, addDiasUteis, diasUteisEntre } from "@/lib/prazos";

export type PrazoExtraidoTipo = "PRAZO" | "EVENTO" | "CONFLITO" | "NENHUM";

export type PrazoExtraido = {
  tipo: PrazoExtraidoTipo;
  // Número de dias escrito no texto (só em PRAZO).
  dias?: number;
  corridos?: boolean;
  // AAAA-MM-DD (calendário puro, mesma convenção de Task.dueDate). Só em PRAZO e EVENTO.
  data?: string;
  // EVENTO: hora escrita no texto, "HH:MM".
  hora?: string;
  // 0 = nada identificado; 1 = baixa (confira); 2 = média; 3 = alta.
  confianca: 0 | 1 | 2 | 3;
  // Trecho EXATO do texto de onde saiu a extração (o painel o destaca com <mark>).
  trecho?: string;
  // Dia (AAAA-MM-DD, Brasília) de onde a contagem partiu — para "Como calculamos".
  base?: string;
  // Motivos e avisos em português, prontos para exibir.
  notas: string[];
  // NENHUM: o texto fala em prazo sem número ("prazo legal") ou em horas.
  mencionaPrazo?: boolean;
  // Índice do item do grupo de onde a extração veio (preenchido por extrairMelhorDoGrupo).
  itemId?: string;
};

const UNIDADES: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19,
};
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100,
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// "quinze" -> 15, "vinte e cinco" -> 25. null se alguma palavra não for número.
export function parseExtenso(texto: string): number | null {
  const partes = semAcento(texto).split(/\s+e\s+/);
  let total = 0;
  for (const parte of partes) {
    const token = parte.trim();
    const v = UNIDADES[token] ?? DEZENAS[token];
    if (v === undefined) return null;
    total += v;
  }
  return total > 0 ? total : null;
}

const ANCORA = String.raw`(?<![\p{L}])(?:prazo\s*:?|em|no|de|para|pelo|por|dentro\s+de)`;
const RE_ALGARISMO = new RegExp(
  String.raw`${ANCORA}\s+(?:o\s+)?(\d{1,3})\s*(?:\(\s*([^)]{2,40}?)\s*\))?\s*dias?(?![-\p{L}])(?:\s+(úteis|uteis|corridos))?`,
  "giu"
);
const RE_EXTENSO = new RegExp(
  String.raw`${ANCORA}\s+(?:o\s+)?([\p{L}]+(?:\s+e\s+[\p{L}]+)?)\s+dias?(?![-\p{L}])(?:\s+(úteis|uteis|corridos))?`,
  "giu"
);
const RE_HORAS = new RegExp(String.raw`${ANCORA}\s+(?:o\s+)?\d{1,3}\s*(?:\([^)]{2,40}\)\s*)?horas?(?![\p{L}])`, "iu");
// Contextos em que "de 30 dias" descreve o passado, não um prazo aberto ("há mais de 30 dias").
const RE_ANTES_PASSADO = /(?:h[áa]|mais|menos|cerca|aproximadamente|decorrid[oa]s?|passad[oa]s?|transcorrid[oa]s?|ap[óo]s)\s*$/iu;
const RE_ADMINISTRATIVO = /alvar[áa]|levantamento|retirad[ao]|retirar/iu;
const RE_PRAZO_GENERICO = /\bprazo\b/iu;
const RE_EVENTO =
  /(audi[êe]ncia|per[íi]cia|sess[ãa]o\s+de\s+julgamento)[^.]{0,200}?(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[^.\d]{0,25}?(\d{1,2})\s*[h:]\s*(\d{2})?)?/iu;

type Candidato = {
  dias: number;
  corridos: boolean;
  temUteis: boolean;
  algarismo?: number;
  extenso?: number | null;
  extensoTxt?: string;
  trecho: string;
  inicio: number;
  administrativo: boolean;
};

function antesPassado(texto: string, indice: number): boolean {
  return RE_ANTES_PASSADO.test(texto.slice(Math.max(0, indice - 25), indice));
}

function contextoAdministrativo(texto: string, inicio: number, fim: number): boolean {
  return RE_ADMINISTRATIVO.test(texto.slice(Math.max(0, inicio - 160), Math.min(texto.length, fim + 60)));
}

function coletarCandidatos(texto: string): { candidatos: Candidato[]; conflitos: Candidato[] } {
  const candidatos: Candidato[] = [];
  const conflitos: Candidato[] = [];

  for (const m of Array.from(texto.matchAll(RE_ALGARISMO))) {
    const inicio = m.index ?? 0;
    if (antesPassado(texto, inicio)) continue;
    const algarismo = parseInt(m[1], 10);
    if (!algarismo) continue;
    const extenso = m[2] ? parseExtenso(m[2]) : undefined;
    const tipoTxt = (m[3] || "").toLowerCase();
    const cand: Candidato = {
      dias: algarismo,
      corridos: tipoTxt === "corridos",
      temUteis: tipoTxt === "úteis" || tipoTxt === "uteis",
      algarismo,
      extenso,
      extensoTxt: m[2]?.trim(),
      trecho: m[0],
      inicio,
      administrativo: contextoAdministrativo(texto, inicio, inicio + m[0].length),
    };
    // Parênteses com palavra que não é número ("15 (quinze) dias" x "15 (cópias) dias") não geram
    // conflito: só quando o extenso é número E difere do algarismo.
    if (extenso != null && extenso !== algarismo) conflitos.push(cand);
    else candidatos.push(cand);
  }

  for (const m of Array.from(texto.matchAll(RE_EXTENSO))) {
    const inicio = m.index ?? 0;
    if (antesPassado(texto, inicio)) continue;
    const extenso = parseExtenso(m[1]);
    if (!extenso) continue;
    const tipoTxt = (m[2] || "").toLowerCase();
    candidatos.push({
      dias: extenso,
      corridos: tipoTxt === "corridos",
      temUteis: tipoTxt === "úteis" || tipoTxt === "uteis",
      extenso,
      trecho: m[0],
      inicio,
      administrativo: contextoAdministrativo(texto, inicio, inicio + m[0].length),
    });
  }

  return { candidatos, conflitos };
}

function dataValida(dia: number, mes: number, ano: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d.toISOString().slice(0, 10);
}

function baseDeContagem(publicadaEm: string | Date): { base: string; baseDate: Date } {
  const base = saoPauloDayKey(publicadaEm);
  return { base, baseDate: new Date(`${base}T00:00:00.000Z`) };
}

export function extrairPrazo(
  conteudo: string,
  kind: string,
  publicadaEm: string | Date,
  feriadosExtras: { date: string }[] = []
): PrazoExtraido {
  const texto = (conteudo || "").replace(/ /g, " ");
  const { base, baseDate } = baseDeContagem(publicadaEm);
  const { candidatos, conflitos } = coletarCandidatos(texto);

  // 1. Número escrito diferente do extenso ("5 (dez) dias"): o texto se contradiz — não há data.
  if (conflitos.length > 0) {
    const c = conflitos[0];
    return {
      tipo: "CONFLITO",
      confianca: 0,
      trecho: c.trecho,
      notas: [
        `O texto diz "${c.algarismo}" em algarismo e "${c.extensoTxt}" por extenso. Não sugerimos data: confira o número correto na íntegra da publicação.`,
      ],
      mencionaPrazo: true,
    };
  }

  // 2. Prazo em dias.
  if (candidatos.length > 0) {
    const distintos = new Map<string, Candidato>();
    for (const c of candidatos) {
      const chave = `${c.dias}|${c.corridos}`;
      const atual = distintos.get(chave);
      // Prefere a menção que traz algarismo + extenso (a mais completa) para o mesmo prazo.
      if (!atual || (c.algarismo != null && c.extenso != null && !(atual.algarismo != null && atual.extenso != null))) distintos.set(chave, c);
    }
    const lista = Array.from(distintos.values()).sort((a, b) => a.dias - b.dias || a.inicio - b.inicio);
    const escolhido = lista[0];
    const notas: string[] = [];

    let confianca: 1 | 2 | 3;
    const concordam = escolhido.algarismo != null && escolhido.extenso != null && escolhido.algarismo === escolhido.extenso;
    if (concordam && escolhido.temUteis && !escolhido.corridos) {
      confianca = 3;
      notas.push("Número em algarismo e por extenso concordam e o texto diz \"dias úteis\".");
    } else if (concordam) {
      confianca = 2;
      notas.push(
        escolhido.corridos
          ? "Número em algarismo e por extenso concordam. O texto diz \"dias corridos\": contamos dias corridos e, se terminar em dia não útil, seguimos para o próximo dia útil."
          : "Número em algarismo e por extenso concordam, mas o texto não diz \"úteis\": contamos como dias úteis (CPC art. 219)."
      );
    } else {
      confianca = 1;
      notas.push(
        escolhido.algarismo != null
          ? "O texto traz o número só em algarismo, sem o extenso para conferir."
          : "O texto traz o número só por extenso, sem o algarismo para conferir."
      );
      if (!escolhido.temUteis && !escolhido.corridos) notas.push("O texto não diz se são dias úteis: contamos como úteis (CPC art. 219).");
      if (escolhido.corridos) notas.push("O texto diz \"dias corridos\": contamos dias corridos e seguimos para o próximo dia útil se terminar em dia não útil.");
    }

    if (lista.length > 1) {
      confianca = 1;
      notas.push(
        `O texto cita ${lista.length} prazos diferentes (${lista.map((c) => `${c.dias} dias`).join(", ")}). Usamos o menor, por segurança. Confira qual vale para o seu caso.`
      );
    }
    if (lista.some((c) => c.administrativo)) {
      confianca = 1;
      notas.push("O trecho parece tratar de ato administrativo (alvará, levantamento, retirada), não de prazo processual.");
    }

    const data = (escolhido.corridos ? addDiasCorridos(baseDate, escolhido.dias, feriadosExtras) : addDiasUteis(baseDate, escolhido.dias, feriadosExtras))
      .toISOString()
      .slice(0, 10);

    const evento = RE_EVENTO.exec(texto);
    if (evento) {
      const dataEvento = dataValida(parseInt(evento[2], 10), parseInt(evento[3], 10), parseInt(evento[4], 10));
      if (dataEvento) notas.push(`O texto também cita ${evento[1].toLowerCase()} em ${dataEvento.split("-").reverse().join("/")}.`);
    }

    return {
      tipo: "PRAZO",
      dias: escolhido.dias,
      corridos: escolhido.corridos,
      data,
      confianca,
      trecho: escolhido.trecho,
      base,
      notas,
      mencionaPrazo: true,
    };
  }

  // 3. Audiência/perícia com data escrita: fato do texto, sem contagem.
  const evento = RE_EVENTO.exec(texto);
  if (evento) {
    const data = dataValida(parseInt(evento[2], 10), parseInt(evento[3], 10), parseInt(evento[4], 10));
    if (data) {
      const hora = evento[5] ? `${evento[5].padStart(2, "0")}:${(evento[6] || "00").padStart(2, "0")}` : undefined;
      return {
        tipo: "EVENTO",
        data,
        hora,
        confianca: 3,
        trecho: evento[0],
        base,
        notas: ["Data escrita no texto (não é contagem de prazo)."],
      };
    }
  }

  // 4. Nada com número.
  const notas: string[] = [];
  let mencionaPrazo = false;
  if (RE_HORAS.test(texto)) {
    mencionaPrazo = true;
    notas.push("O texto cita prazo em horas. Não calculamos: confira na íntegra.");
  } else if (RE_PRAZO_GENERICO.test(texto)) {
    mencionaPrazo = true;
    notas.push("O texto cita prazo legal, sem número de dias. Confira na íntegra qual prazo se aplica.");
  } else if (kind === "ANDAMENTO") {
    notas.push("Andamento sem prazo no texto.");
  } else {
    notas.push("Nenhum número de dias encontrado no texto.");
  }
  return { tipo: "NENHUM", confianca: 0, notas, mencionaPrazo, base };
}

// Grupo com o mesmo evento vindo de mais de uma fonte: usa a extração mais segura para o advogado —
// prazo com a data mais próxima; se não houver prazo, conflito; depois evento; por último nenhum.
export function extrairMelhorDoGrupo(
  itens: { id: string; content: string; kind: string; publishedAt: string | Date }[],
  feriadosExtras: { date: string }[] = []
): PrazoExtraido {
  let melhor: PrazoExtraido | null = null;
  const peso = (e: PrazoExtraido) => (e.tipo === "PRAZO" ? 0 : e.tipo === "CONFLITO" ? 1 : e.tipo === "EVENTO" ? 2 : 3);
  for (const item of itens) {
    const e = { ...extrairPrazo(item.content, item.kind, item.publishedAt, feriadosExtras), itemId: item.id };
    if (!melhor) {
      melhor = e;
      continue;
    }
    if (peso(e) < peso(melhor) || (peso(e) === peso(melhor) && e.tipo === "PRAZO" && (e.data ?? "") < (melhor.data ?? ""))) melhor = e;
  }
  return melhor ?? { tipo: "NENHUM", confianca: 0, notas: [] };
}

export type FaixaPrazo = "venc" | "hoje" | "d3" | "d15" | "dep" | "sem" | "cien";

export type SituacaoPrazo = {
  // Dias úteis de hoje até a data (negativo = atraso). null quando não há data.
  du: number | null;
  faixa: FaixaPrazo;
  // true quando a data vem de extração de confiança baixa: a tela diz "possível", nunca afirma.
  aConfirmar: boolean;
};

// "Vencido" só sai de uma data extraída do próprio texto (fato do texto + data de publicação) e a
// tela só o AFIRMA com confiança média ou alta; com confiança baixa ela diz "possivelmente vencido,
// confira" (aConfirmar). Sem data, nunca há faixa de vencimento: "sem" (prazo não identificado) ou
// "cien" (andamento sem prazo, só ciência; audiência que já passou).
export function situacaoPrazo(
  extracao: PrazoExtraido,
  kind: string,
  hojeKey: string,
  feriadosExtras: { date: string }[] = []
): SituacaoPrazo {
  if (!extracao.data || (extracao.tipo !== "PRAZO" && extracao.tipo !== "EVENTO")) {
    const ciencia = extracao.tipo === "NENHUM" && kind === "ANDAMENTO" && !extracao.mencionaPrazo;
    return { du: null, faixa: ciencia ? "cien" : "sem", aConfirmar: false };
  }
  const hoje = new Date(`${hojeKey}T00:00:00.000Z`);
  const alvo = new Date(`${extracao.data}T00:00:00.000Z`);
  const du = diasUteisEntre(hoje, alvo, feriadosExtras);
  if (extracao.tipo === "EVENTO" && du < 0) return { du, faixa: "cien", aConfirmar: false };
  const aConfirmar = extracao.confianca <= 1;
  if (du < 0) return { du, faixa: "venc", aConfirmar };
  if (du === 0) return { du, faixa: "hoje", aConfirmar };
  if (du <= 3) return { du, faixa: "d3", aConfirmar };
  if (du <= 15) return { du, faixa: "d15", aConfirmar };
  return { du, faixa: "dep", aConfirmar };
}

// Ordem das faixas na fila por urgência: o que já venceu primeiro, "sem prazo identificado" antes de
// "só ciência" (o primeiro pode esconder um prazo real).
export const ORDEM_FAIXA: Record<FaixaPrazo, number> = { venc: 0, hoje: 1, d3: 2, d15: 3, dep: 4, sem: 5, cien: 6 };

// Idade em dias úteis desde a publicação: FATO (não depende da extração).
export function idadeEmDiasUteis(publicadaEm: string | Date, hojeKey: string, feriadosExtras: { date: string }[] = []): number {
  const { baseDate } = baseDeContagem(publicadaEm);
  return diasUteisEntre(baseDate, new Date(`${hojeKey}T00:00:00.000Z`), feriadosExtras);
}
