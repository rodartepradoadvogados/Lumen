import { stageLabels } from "@/lib/funil";

// ============================================================================
// A ABA DETALHES DO APLICATIVO DE ATENDIMENTO — a lógica que não depende de tela nem de banco.
//
// Mora aqui, e não dentro dos componentes, por dois motivos: (1) o que decide "o que a pessoa lê" (o
// resumo, o prazo, as colunas do quadro, o que a conversão vai fazer) é regra do produto e precisa de
// teste sem navegador; (2) servidor e cliente leem as mesmas palavras — uma só fonte, sem cópia.
// ============================================================================

export type ChaveDoBloco = "triagem" | "pendencias" | "processo" | "dados" | "anexos" | "tarefas" | "anotacoes" | "encerrar";

/**
 * Os blocos da aba, na ordem em que aparecem. `abertoPorPadrao` segue a proposta (seção 6.10): o que a
 * triagem apurou, as pendências e o "transformar em processo" abrem sozinhos — é o que se decide com o
 * lead na mão. O resto fica fechado e o índice o abre ao toque.
 */
export const BLOCOS_DOS_DETALHES: { chave: ChaveDoBloco; rotulo: string; titulo: string; abertoPorPadrao: boolean }[] = [
  { chave: "triagem", rotulo: "Triagem", titulo: "O que a triagem apurou", abertoPorPadrao: true },
  { chave: "pendencias", rotulo: "Pendências", titulo: "Pendências", abertoPorPadrao: true },
  { chave: "processo", rotulo: "Processo", titulo: "Transformar em processo ou caso", abertoPorPadrao: true },
  { chave: "dados", rotulo: "Dados", titulo: "Dados do atendimento", abertoPorPadrao: false },
  { chave: "anexos", rotulo: "Anexos", titulo: "Anexos e documentos", abertoPorPadrao: false },
  { chave: "tarefas", rotulo: "Tarefas", titulo: "Tarefas do atendimento", abertoPorPadrao: false },
  { chave: "anotacoes", rotulo: "Anotações", titulo: "Anotações pessoais", abertoPorPadrao: false },
  { chave: "encerrar", rotulo: "Encerrar", titulo: "Encerrar", abertoPorPadrao: false },
];

// ── vocabulários fechados (o servidor valida contra estas listas) ─────────

export const CANAIS_DO_ATENDIMENTO: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

/** As mesmas origens do formulário comercial do site (components/AttendanceCommercialForm.tsx). */
export const ORIGENS_DO_LEAD: Record<string, string> = { INDICACAO: "Indicação", INSTAGRAM: "Instagram", GOOGLE: "Google", SITE: "Site", WHATSAPP: "WhatsApp", OUTRO: "Outro" };

export const TIPOS_DE_TAREFA: Record<string, string> = { TAREFA: "Tarefa", EVENTO: "Evento", PRAZO: "Prazo" };
export const PRIORIDADES_DE_TAREFA: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" };

/** "aaaa-mm-dd" válido de calendário (31 de abril não passa). */
export function diaValido(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ── datas-calendário ────────────────────────────────────────────────────────

/** O dia de hoje em Brasília, como "aaaa-mm-dd" (é o formato de um <input type="date">). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** "aaaa-mm-dd" de uma data-calendário gravada como meia-noite UTC (Task.dueDate, pendência). */
export function diaDoCalendario(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}

const MS_DIA = 86_400_000;

/** Quantos dias faltam (negativo = venceu) entre hoje e uma data-calendário. */
export function diasAte(dia: string, hoje: string): number {
  return Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / MS_DIA);
}

export type TomDoPrazo = "vencido" | "hoje" | "futuro";

/** O prazo em português corrido: "venceu há 2 dias", "vence hoje", "vence amanhã", "vence em 5 dias". */
export function fraseDoPrazo(dia: string | null, hoje: string): { texto: string; tom: TomDoPrazo } | null {
  if (!dia) return null;
  const n = diasAte(dia, hoje);
  if (n < 0) return { texto: n === -1 ? "venceu ontem" : `venceu há ${-n} dias`, tom: "vencido" };
  if (n === 0) return { texto: "vence hoje", tom: "hoje" };
  if (n === 1) return { texto: "vence amanhã", tom: "futuro" };
  return { texto: `vence em ${n} dias`, tom: "futuro" };
}

/** "31/12/2026" a partir de "2026-12-31" (sem passar por fuso). */
export function dataCurta(dia: string | null | undefined): string {
  if (!dia) return "";
  const [a, m, d] = dia.split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

// ── o resumo de uma linha ───────────────────────────────────────────────────

export type EntradaDoResumo = {
  area: string | null;
  stage: string;
  estimatedValue: number | null;
  /** Datas-calendário ("aaaa-mm-dd") dos prazos das pendências ABERTAS; `null` = sem prazo. */
  prazosAbertos: (string | null)[];
  hoje: string;
};

/**
 * "Sucessões · Proposta · R$ 4.800,00 · 3 pendências abertas · a próxima venceu há 1 dia".
 * Só o que existe: sem matéria, sem valor, sem prazo — a peça some em vez de virar "—".
 */
export function resumoDoAtendimento(e: EntradaDoResumo): string {
  const partes: string[] = [];
  if (e.area?.trim()) partes.push(e.area.trim());
  partes.push(stageLabels[e.stage] ?? stageLabels.NOVO);
  if (e.estimatedValue != null && e.estimatedValue > 0) {
    partes.push(e.estimatedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  }
  const n = e.prazosAbertos.length;
  partes.push(n === 0 ? "sem pendências" : n === 1 ? "1 pendência aberta" : `${n} pendências abertas`);
  const proximo = e.prazosAbertos.filter((p): p is string => Boolean(p)).sort()[0];
  const f = fraseDoPrazo(proximo ?? null, e.hoje);
  if (f) partes.push(`a próxima ${f.texto}`);
  return partes.join(" · ");
}

// ── o quadro de tarefas (colunas reais do escritório) ───────────────────────

export type ColunaDoQuadro = { id: string; name: string; isDoneCol: boolean };

/**
 * Agrupa as tarefas pelas colunas REAIS do quadro do escritório (N21). Tarefa sem coluna, ou numa coluna
 * que já não existe, cai na primeira — a mesma leitura do quadro do site, para nenhuma tarefa sumir.
 */
export function agruparPorColuna<T extends { columnId: string | null }>(colunas: ColunaDoQuadro[], tarefas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const c of colunas) mapa.set(c.id, []);
  const primeira = colunas[0]?.id;
  for (const t of tarefas) {
    const alvo = t.columnId && mapa.has(t.columnId) ? t.columnId : primeira;
    if (alvo) mapa.get(alvo)!.push(t);
  }
  return mapa;
}

// ── anotação pessoal: do HTML do site para o texto do celular ───────────────

/**
 * O texto de uma anotação (que o site grava como HTML já saneado) para o campo de texto do celular.
 * `temFormatacao` avisa a quem edita que negrito, itálico e listas feitos no computador viram texto
 * simples ao salvar por aqui — em vez de perdê-los em silêncio.
 */
export function anotacaoParaTexto(html: string): { texto: string; temFormatacao: boolean } {
  const temFormatacao = /<(b|strong|i|em|u|ul|ol|li|a|h[1-6]|blockquote)\b/i.test(html);
  const texto = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { texto, temFormatacao };
}

// ── abrir anexo com segurança ───────────────────────────────────────────────

/**
 * O endereço de um anexo só vira link se for http(s). O que estiver gravado com qualquer outro esquema
 * (javascript:, data:…) não é aberto: a tela mostra "Link indisponível". O link abre em outra aba, com
 * `noopener noreferrer` — o Drive não roda dentro do aplicativo, e o Referer não vaza o endereço da conversa.
 */
export function enderecoSeguroDoAnexo(url: string | null | undefined): string | null {
  const t = (url ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Onde o arquivo mora, em português: só pelo nome do domínio, nunca pelo endereço inteiro. */
export function origemDoAnexo(url: string | null | undefined): string {
  const seguro = enderecoSeguroDoAnexo(url);
  if (!seguro) return "link indisponível";
  const host = new URL(seguro).hostname;
  if (host.endsWith("drive.google.com") || host.endsWith("docs.google.com")) return "Google Drive";
  if (host.endsWith("sharepoint.com") || host.endsWith("onedrive.live.com") || host.endsWith("1drv.ms")) return "OneDrive";
  if (host.endsWith("dropbox.com")) return "Dropbox";
  return host;
}

// ── valor em reais digitado no celular ──────────────────────────────────────

/**
 * "4.800,50", "R$ 4800", "4800.5" → número. Vazio → `null` (sem valor). Ilegível ou negativo → `"invalido"`.
 * A vírgula é o separador decimal (é como se escreve no Brasil); ponto sozinho com 1 ou 2 casas depois
 * também vale como decimal ("4800.5"), e ponto seguido de 3 dígitos é milhar ("4.800").
 */
export function lerValorEmReais(texto: string): number | null | "invalido" {
  const t = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (!/^\d[\d.,]*$/.test(t)) return "invalido";
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "invalido";
}

/** O valor de volta para o campo: 4800.5 → "4.800,50"; sem valor → "". */
export function valorParaCampo(v: number | null | undefined): string {
  return v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
