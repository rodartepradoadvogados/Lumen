// Regras PURAS (sem Prisma, sem React) do seletor de documentos do passo "Documentos" do
// Peticionamento — exercitadas em lib/testes/peticionamentoSeletorDocumentos.teste.ts.
//
// O pedido do dono: filtro por TIPO (caixas de seleção) + lista do que foi filtrado com busca
// inteligente ("quanto mais filtro, mais fácil") + cada processo/demanda/licitação RECOLHIDO só com o
// título, expandindo os documentos ao clicar. UM nível só (item → documentos): "accordion dentro de
// accordion" foi recusado pelo dono (ver lib/peticionamentoDocumentosDemanda.ts).
//
// Decisões do dono para os tipos (perguntas abertas 7 e 8 do plano):
//   Processo judicial          = Case.type JUDICIAL
//   Processo extrajudicial     = Case.type EXTRAJUDICIAL + legados (CASO em lib/caseNatureza.ts) + ADMINISTRATIVO
//   Licitação                  = Licitacao
//   Demandas / Pareceres       = Parecer, Atendimento vinculado à assessoria e documento geral da assessoria
// Resumo fixo: "N documentos selecionados de M itens", M = itens com algum documento marcado.

import { normalizeForCompare } from "@/lib/textNormalize";

// ── tipos ──────────────────────────────────────────────────────────────────────────────────────

/** O que o item É, no modelo de dados. */
export type TipoDeDemanda = "PROCESSO_JUDICIAL" | "PROCESSO_EXTRAJUDICIAL" | "LICITACAO" | "DEMANDA" | "ATENDIMENTO" | "GERAL";

/** As quatro caixas de seleção do filtro. */
export type CategoriaDoFiltro = "PJ" | "PE" | "LI" | "DP";

export const CATEGORIAS: { chave: CategoriaDoFiltro; rotulo: string }[] = [
  { chave: "PJ", rotulo: "Processo judicial" },
  { chave: "PE", rotulo: "Processo extrajudicial" },
  { chave: "LI", rotulo: "Licitação" },
  { chave: "DP", rotulo: "Demandas / Pareceres" },
];

export const ROTULO_DA_CATEGORIA: Record<CategoriaDoFiltro, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.chave, c.rotulo])) as Record<CategoriaDoFiltro, string>;

export function categoriaDoTipo(tipo: TipoDeDemanda): CategoriaDoFiltro {
  if (tipo === "PROCESSO_JUDICIAL") return "PJ";
  if (tipo === "PROCESSO_EXTRAJUDICIAL") return "PE";
  if (tipo === "LICITACAO") return "LI";
  return "DP"; // DEMANDA, ATENDIMENTO, GERAL
}

/** Case.type bruto → tipo do item. Só JUDICIAL é judicial; o resto (EXTRAJUDICIAL, ADMINISTRATIVO, legados, null) é extrajudicial. */
export function tipoDoCase(caseType: string | null | undefined): "PROCESSO_JUDICIAL" | "PROCESSO_EXTRAJUDICIAL" {
  return caseType === "JUDICIAL" ? "PROCESSO_JUDICIAL" : "PROCESSO_EXTRAJUDICIAL";
}

export type DocumentoDoSeletor = {
  id: string;
  name: string;
  docType: string;
  driveUrl: string | null;
  demandaId: string | null;
  demandaTipo: TipoDeDemanda;
  demandaTitulo: string;
  demandaNumero: string | null;
  demandaPartes: string | null;
};

export type ItemDoSeletor = {
  id: string;
  tipo: TipoDeDemanda;
  categoria: CategoriaDoFiltro;
  titulo: string;
  numero: string | null;
  partes: string | null;
  docs: DocumentoDoSeletor[];
};

/** Um item por demandaId, na ordem da primeira aparição (a lista de entrada já vem do mais recente). */
export function agruparPorItem(documentos: DocumentoDoSeletor[]): ItemDoSeletor[] {
  const porId = new Map<string, ItemDoSeletor>();
  for (const d of documentos) {
    const id = d.demandaId ?? "sem-demanda";
    let item = porId.get(id);
    if (!item) {
      item = {
        id,
        tipo: d.demandaTipo,
        categoria: categoriaDoTipo(d.demandaTipo),
        titulo: d.demandaTitulo || "Documentos sem demanda",
        numero: d.demandaNumero,
        partes: d.demandaPartes,
        docs: [],
      };
      porId.set(id, item);
    }
    item.docs.push(d);
  }
  return [...porId.values()];
}

// ── busca ──────────────────────────────────────────────────────────────────────────────────────

const ROTULO_DO_TIPO: Record<TipoDeDemanda, string> = {
  PROCESSO_JUDICIAL: "Processo judicial",
  PROCESSO_EXTRAJUDICIAL: "Processo extrajudicial",
  LICITACAO: "Licitação",
  DEMANDA: "Parecer / Demanda",
  ATENDIMENTO: "Atendimento",
  GERAL: "Documentos gerais",
};

export function rotuloDoTipo(tipo: TipoDeDemanda): string {
  return ROTULO_DO_TIPO[tipo];
}

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const EH_NUMERO_COM_MASCARA = /^[\d.\-/\s]+$/;
/** Um termo é "número" quando só tem dígitos e a pontuação de máscara CNJ e ≥ 4 dígitos ("0051", "5012345-67.2024"). */
export const MINIMO_DE_DIGITOS_NA_BUSCA_DE_NUMERO = 4;

function camposDeBusca(item: ItemDoSeletor): string {
  return normalizeForCompare([item.titulo, item.partes ?? "", ROTULO_DA_CATEGORIA[item.categoria], rotuloDoTipo(item.tipo), item.numero ?? ""].join(" • "));
}

/**
 * Cada palavra digitada precisa aparecer (E) em título, partes, tipo ou número — sem acento e sem
 * caixa. Termo numérico (≥ 4 dígitos, só dígitos/máscara) compara só os dígitos do número do item:
 * "5012345-67.2024.8.09.0051", "50123456720248090051" e "0051" acham o mesmo processo.
 */
export function casaBusca(item: ItemDoSeletor, consulta: string): boolean {
  const texto = consulta.trim();
  if (!texto) return true;
  const campos = camposDeBusca(item);
  const digitosDoNumero = soDigitos(item.numero);
  return texto.split(/\s+/).every((palavra) => {
    const d = soDigitos(palavra);
    if (d.length >= MINIMO_DE_DIGITOS_NA_BUSCA_DE_NUMERO && EH_NUMERO_COM_MASCARA.test(palavra)) {
      return digitosDoNumero.includes(d) || campos.includes(normalizeForCompare(palavra));
    }
    return campos.includes(normalizeForCompare(palavra));
  });
}

// ── filtros ────────────────────────────────────────────────────────────────────────────────────

export type FiltrosDoSeletor = {
  tipos: ReadonlySet<CategoriaDoFiltro>;
  busca: string;
  soSelecionados: boolean;
};

export const SEM_FILTROS: FiltrosDoSeletor = { tipos: new Set(), busca: "", soSelecionados: false };

export function temAlgumFiltro(f: FiltrosDoSeletor): boolean {
  return f.tipos.size > 0 || f.busca.trim() !== "" || f.soSelecionados;
}

const temMarcado = (item: ItemDoSeletor, sel: ReadonlySet<string>) => item.docs.some((d) => sel.has(d.id));

/** `ignorar` deixa de aplicar UM filtro — para as contagens por faceta e para as sugestões do estado vazio. */
export function itemPassa(item: ItemDoSeletor, f: FiltrosDoSeletor, sel: ReadonlySet<string>, ignorar?: "tipos" | "busca" | "soSelecionados"): boolean {
  if (ignorar !== "tipos" && f.tipos.size > 0 && !f.tipos.has(item.categoria)) return false;
  if (ignorar !== "soSelecionados" && f.soSelecionados && !temMarcado(item, sel)) return false;
  if (ignorar !== "busca" && !casaBusca(item, f.busca)) return false;
  return true;
}

export function filtrarItens(itens: ItemDoSeletor[], f: FiltrosDoSeletor, sel: ReadonlySet<string>): ItemDoSeletor[] {
  return itens.filter((i) => itemPassa(i, f, sel));
}

/** Contagem por caixa de tipo: quanto sobraria se a caixa estivesse marcada, dados a busca e os demais filtros (faceta). */
export function contarPorTipo(itens: ItemDoSeletor[], f: FiltrosDoSeletor, sel: ReadonlySet<string>): Record<CategoriaDoFiltro, number> {
  const r: Record<CategoriaDoFiltro, number> = { PJ: 0, PE: 0, LI: 0, DP: 0 };
  for (const i of itens) if (itemPassa(i, f, sel, "tipos")) r[i.categoria]++;
  return r;
}

export function contarDocumentos(itens: ItemDoSeletor[]): number {
  return itens.reduce((a, i) => a + i.docs.length, 0);
}

export type SugestaoDeVazio = { acao: "tipos" | "busca" | "soSelecionados"; rotulo: string; quantidade: number };

/** Qual filtro, se removido, devolveria resultado — nunca sugere o que continuaria vazio. */
export function sugestoesDeVazio(itens: ItemDoSeletor[], f: FiltrosDoSeletor, sel: ReadonlySet<string>): SugestaoDeVazio[] {
  const s: SugestaoDeVazio[] = [];
  const conta = (ig: "tipos" | "busca" | "soSelecionados") => itens.filter((i) => itemPassa(i, f, sel, ig)).length;
  if (f.tipos.size) { const n = conta("tipos"); if (n) s.push({ acao: "tipos", rotulo: "Remover o filtro de tipo", quantidade: n }); }
  if (f.soSelecionados) { const n = conta("soSelecionados"); if (n) s.push({ acao: "soSelecionados", rotulo: "Mostrar também itens sem selecionados", quantidade: n }); }
  if (f.busca.trim()) { const n = conta("busca"); if (n) s.push({ acao: "busca", rotulo: `Limpar a busca “${f.busca.trim()}”`, quantidade: n }); }
  return s;
}

// ── seleção ────────────────────────────────────────────────────────────────────────────────────

export type ResumoDaSelecao = { documentos: number; itens: number; totalItens: number; totalDocumentos: number };

/** N = documentos marcados no TOTAL (não só nos visíveis); M = itens com algum marcado. Só conta id que existe na lista. */
export function resumoDaSelecao(itens: ItemDoSeletor[], sel: ReadonlySet<string>): ResumoDaSelecao {
  let documentos = 0;
  let comMarcado = 0;
  for (const i of itens) {
    const n = i.docs.filter((d) => sel.has(d.id)).length;
    documentos += n;
    if (n > 0) comMarcado++;
  }
  return { documentos, itens: comMarcado, totalItens: itens.length, totalDocumentos: contarDocumentos(itens) };
}

export type EstadoDoItem = "todos" | "parcial" | "nenhum";

export function estadoDoItem(item: ItemDoSeletor, sel: ReadonlySet<string>): EstadoDoItem {
  const n = item.docs.filter((d) => sel.has(d.id)).length;
  if (n === 0) return "nenhum";
  return n === item.docs.length ? "todos" : "parcial";
}

/** Nova seleção com todos os documentos do item marcados (`marcar`) ou desmarcados. Preserva o resto, na ordem. */
export function definirItemInteiro(sel: readonly string[], item: ItemDoSeletor, marcar: boolean): string[] {
  const doItem = new Set(item.docs.map((d) => d.id));
  const resto = sel.filter((id) => !doItem.has(id));
  return marcar ? [...resto, ...item.docs.map((d) => d.id)] : resto;
}

export function definirDocumento(sel: readonly string[], id: string, marcar: boolean): string[] {
  const resto = sel.filter((x) => x !== id);
  return marcar ? [...resto, id] : resto;
}

// ── destaque do trecho encontrado ──────────────────────────────────────────────────────────────

export type Trecho = { texto: string; destaque: boolean };

/** Parte o texto em trechos, marcando onde as palavras da busca aparecem (sem acento/caixa). */
export function trechosDestacados(texto: string, consulta: string): Trecho[] {
  const termos = consulta.trim().split(/\s+/).map((t) => normalizeForCompare(t)).filter(Boolean);
  if (!termos.length || !texto) return [{ texto, destaque: false }];
  // normaliza caractere a caractere para os índices continuarem alinhados ao texto original
  const chars = [...texto];
  const base = chars.map((c) => normalizeForCompare(c)[0] ?? c.toLowerCase()).join("");
  const faixas: [number, number][] = [];
  for (const t of termos) {
    let i = -1;
    while ((i = base.indexOf(t, i + 1)) >= 0) faixas.push([i, i + t.length]);
  }
  if (!faixas.length) return [{ texto, destaque: false }];
  faixas.sort((a, b) => a[0] - b[0]);
  const unidas: [number, number][] = [];
  for (const f of faixas) {
    const ult = unidas[unidas.length - 1];
    if (ult && f[0] <= ult[1]) ult[1] = Math.max(ult[1], f[1]);
    else unidas.push([f[0], f[1]]);
  }
  const saida: Trecho[] = [];
  let pos = 0;
  for (const [a, b] of unidas) {
    if (a > pos) saida.push({ texto: chars.slice(pos, a).join(""), destaque: false });
    saida.push({ texto: chars.slice(a, b).join(""), destaque: true });
    pos = b;
  }
  if (pos < chars.length) saida.push({ texto: chars.slice(pos).join(""), destaque: false });
  return saida;
}

// ── gravação serial (uma escrita por ação, sem se atropelar) ───────────────────────────────────

/**
 * O defeito de antes: cada clique disparava uma gravação e "selecionar todos" de 9 documentos eram 9
 * chamadas concorrentes — a última a CHEGAR vencia, não a última a ser clicada. Aqui há no máximo UMA
 * gravação em voo; enquanto ela roda, o pedido mais novo substitui o pendente (coalescência), e ao
 * terminar sai UMA gravação com o estado final. Falhou: `aoFalhar` recebe o último estado que o
 * servidor CONFIRMOU, para a tela voltar a ele.
 */
export function criarGravadorSerial(gravar: (ids: string[]) => Promise<unknown>, aoFalhar: (ultimoConfirmado: string[]) => void, inicial: string[]) {
  let confirmado = [...inicial];
  let pendente: string[] | null = null;
  let emVoo: Promise<void> | null = null;

  async function drenar() {
    while (pendente) {
      const alvo: string[] = pendente;
      pendente = null;
      try {
        await gravar(alvo);
        confirmado = alvo;
      } catch {
        pendente = null;
        aoFalhar([...confirmado]);
      }
    }
  }
  return {
    pedir(ids: string[]): Promise<void> {
      pendente = [...ids];
      if (!emVoo) {
        emVoo = drenar().finally(() => { emVoo = null; });
      }
      return emVoo;
    },
  };
}
