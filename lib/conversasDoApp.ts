import { entregaDaLinha, type EntregaDaMensagem } from "@/lib/entregaDaMensagem";
import { stageLabels, stageOptions, faseDoLead } from "@/lib/funil";
import { previaDaMensagem, prefixoDaPrevia, tempoRelativo, type ContagensPorFase } from "@/lib/listaDeAtendimentos";
import { nomeDaLinha, rotuloDaEspera } from "@/lib/rotulosDaEspera";
import { detalheDoRelogio, estadoDoRelogio, tituloDoRelogio } from "@/lib/relogioDoAtendimento";
import { lerMidia, previaDoCorpo, type TipoDeMidia } from "@/lib/mensagensDoChat";
import { BASE_DO_APP } from "@/lib/navegacaoDoAtendimentoApp";

// ============================================================================
// A LISTA DE CONVERSAS DO APLICATIVO DE ATENDIMENTO (ONDA A) — filtros, chips e a linha, sem banco.
//
// UMA ESCOLHA POR VEZ, NO CHIP: "Todas", "Esperando resposta" ou UMA fase (Novo, Aguardando,
// Qualificação, Proposta, Fechado, Perdido). "Esperando resposta" é FATO (a última mensagem é do
// cliente), não fase — por isso é um chip à parte, e a linha mostra as duas coisas juntas sem
// confundi-las (ver a nota do topo de lib/funil.ts). NÃO HÁ contador de não lidas (decisão do dono).
//
// O valor da URL NUNCA vira consulta cru: `lerFiltroDaLista` só devolve um valor conhecido.
// ============================================================================

export const LIMITE_DA_LISTA = 200;

export type FiltroDaLista = "todas" | "esperando" | string; // string = um estágio de stageOptions

export function lerFiltroDaLista(valor: string | string[] | undefined | null): FiltroDaLista {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (v === "esperando") return "esperando";
  return typeof v === "string" && stageOptions.includes(v) ? v : "todas";
}

export type RecorteDaListaApp = { f?: FiltroDaLista | null; q?: string | null; arq?: boolean };

/** O endereço da lista com o que a pessoa escolheu — uma função só, para chip, busca e "ver todas". */
export function hrefDaListaApp(r: RecorteDaListaApp = {}): string {
  const partes: string[] = [];
  if (r.f && r.f !== "todas") partes.push(`f=${encodeURIComponent(r.f)}`);
  const q = (r.q ?? "").trim();
  if (q) partes.push(`q=${encodeURIComponent(q)}`);
  if (r.arq) partes.push("arq=1");
  return partes.length ? `${BASE_DO_APP}?${partes.join("&")}` : BASE_DO_APP;
}

export type Chip = { chave: FiltroDaLista; rotulo: string; contagem: number };

/** Os chips, na ordem: Todas, Esperando resposta, e as seis fases. */
export function chipsDaLista(contagens: ContagensPorFase, esperando: number): Chip[] {
  return [
    { chave: "todas", rotulo: "Todas", contagem: contagens.TODAS },
    { chave: "esperando", rotulo: "Esperando resposta", contagem: esperando },
    ...stageOptions.map((s) => ({ chave: s, rotulo: stageLabels[s], contagem: contagens[s] ?? 0 })),
  ];
}

/** A busca só vale com 2 letras ou mais; devolve o termo aparado, ou "". */
export function termoDeBusca(bruto: string | undefined | null): string {
  const t = (bruto ?? "").replace(/\s+/g, " ").trim();
  return t.length >= 2 ? t.slice(0, 80) : "";
}

/** Só os dígitos do termo (para achar por número), ou "" quando são poucos para ser número. */
export function digitosDoTermo(termo: string): string {
  const d = termo.replace(/\D/g, "");
  return d.length >= 4 ? d : "";
}

/** Ids dos atendimentos cuja ÚLTIMA mensagem é do cliente, na ordem em que vieram (já por atividade). */
export function idsEsperandoResposta(linhas: { id: string; whatsappMessages: { direction: string }[] }[]): string[] {
  return linhas.filter((l) => l.whatsappMessages[0]?.direction === "IN").map((l) => l.id);
}

export type LinhaDaListaApp = {
  id: string;
  clientName: string;
  waPhone: string | null;
  subject: string;
  stage: string;
  convertedCaseId: string | null;
  createdAt: Date;
  ultimaAtividadeEm: Date;
  prazoDeRespostaAte: Date | null;
  agenteResponde: boolean;
  agenteSilenciadoEm: Date | null;
  responsible: { name: string } | null;
  whatsappMessages: { direction: string; body: string; porAgente: boolean; createdAt: Date; status?: string; entregueEm?: Date | null; lidaEm?: Date | null }[];
  /** A mensagem fixada do atendimento (`MensagemFixada`, uma por atendimento), se houver. Só o id importa aqui. */
  mensagemFixada?: { id: string } | null;
};

export type LinhaPronta = {
  id: string;
  href: string;
  nome: string;
  iniciais: string;
  /** "agora", "12 min", "14:32", "ontem", "27/09" — a última atividade. */
  quando: string;
  quandoISO: string;
  /** Prefixo + prévia. Vazio prefixo quando quem falou por último foi o cliente. */
  prefixo: string;
  previa: string;
  semResposta: { espera: string; relogio: string | null } | null;
  faseChave: string;
  fase: string;
  processo: boolean;
  quemAtende: string | null;
  /**
   * ESPERANDO RESPOSTA = a última mensagem é do cliente. É o dado mais próximo de "não lida" que existe HOJE:
   * o sistema não guarda "lida/não lida" por conversa nem quantas mensagens o cliente mandou em sequência. Por
   * isso a linha em destaque (nome em negrito, hora em ouro) usa este fato, e o selo é um PONTO, não um número.
   */
  esperando: boolean;
  /** O tipo da mídia da última mensagem (para o ícone da prévia), ou null quando é texto. */
  midia: TipoDeMidia | null;
  /** A última mensagem é nossa (pessoa ou Ana) e o WhatsApp a aceitou: mostra "✓✓" (enviada; NÃO diz "lida"). */
  enviada: boolean;
  /** O ciclo de entrega da última mensagem, quando é nossa e o provedor a aceitou (R2A): ✓ / ✓✓ / ✓✓ em destaque. */
  entrega: EntregaDaMensagem | null;
  /** A última mensagem nossa foi recusada pelo WhatsApp. */
  falhou: boolean;
  /** A Ana está respondendo esta conversa (selinho "Ana"). */
  anaAtende: boolean;
  /** A conversa tem mensagem fixada (alfinete). Não é "conversa fixada no topo": esse dado não existe. */
  fixada: boolean;
};

export function iniciaisDoNome(nome: string): string {
  const partes = nome.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** A linha da lista, com tudo o que a tela escreve já decidido (e provado em teste). */
export function montarLinha(a: LinhaDaListaApp, agora: Date, nomeDoAtendente: string): LinhaPronta {
  const ultima = a.whatsappMessages[0];
  const nome = nomeDaLinha(a.clientName, a.waPhone);
  const esperando = ultima?.direction === "IN";
  const minutos = esperando ? Math.max(0, Math.floor((agora.getTime() - ultima.createdAt.getTime()) / 60_000)) : null;
  let semResposta: LinhaPronta["semResposta"] = null;
  if (esperando) {
    const estado = estadoDoRelogio(a.prazoDeRespostaAte, agora);
    const relogio = estado.tipo === "correndo" || estado.tipo === "estourado" ? `${tituloDoRelogio(estado)} · ${detalheDoRelogio(estado)}` : null;
    semResposta = { espera: rotuloDaEspera(minutos) ?? "", relogio };
  }
  const faseChave = faseDoLead(a.stage);
  return {
    id: a.id,
    href: `${BASE_DO_APP}/${a.id}`,
    nome,
    iniciais: iniciaisDoNome(nome),
    quando: tempoRelativo(a.ultimaAtividadeEm, agora),
    quandoISO: a.ultimaAtividadeEm.toISOString(),
    prefixo: prefixoDaPrevia(ultima ? { ...ultima } : undefined, nomeDoAtendente),
    previa: ultima ? previaDaMensagem(previaDoCorpo(ultima.body)) : previaDaMensagem(a.subject),
    semResposta,
    faseChave,
    fase: stageLabels[faseChave],
    processo: Boolean(a.convertedCaseId),
    quemAtende: a.agenteResponde && !a.agenteSilenciadoEm ? nomeDoAtendente : a.responsible?.name ?? null,
    esperando,
    midia: ultima ? lerMidia(ultima.body)?.tipo ?? null : null,
    enviada: ultima?.direction === "OUT" && ultima.status !== "FAILED",
    entrega: ultima?.direction === "OUT" && ultima.status !== "FAILED" ? (entregaDaLinha({ direction: "OUT", status: "SENT", entregueEm: ultima.entregueEm, lidaEm: ultima.lidaEm }) ?? "enviada") : null,
    falhou: ultima?.direction === "OUT" && ultima.status === "FAILED",
    anaAtende: a.agenteResponde && !a.agenteSilenciadoEm,
    fixada: Boolean(a.mensagemFixada),
  };
}
