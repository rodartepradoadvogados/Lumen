import type { IncomingMessage } from "@/lib/whatsapp";
import { type TipoMidiaWhatsapp } from "@/lib/driveNaming";

// ============================================================================
// EVOLUTION API — o caminho não oficial do WhatsApp.
//
// POR QUE ELE EXISTE. A Cloud API da Meta exige que o número seja cadastrado numa conta de
// WhatsApp Business dentro do Business Manager. Um número que já está preso a outra conta da Meta
// — campanhas, por exemplo — não entra, e não há botão que resolva. A Evolution conversa pelo
// mesmo protocolo do WhatsApp Web: o escritório lê um QR code e pronto, sem a Meta no meio.
//
// O PREÇO DISSO, DITO NO CÓDIGO PARA NINGUÉM DESCOBRIR DEPOIS: é contra os termos de uso do
// WhatsApp, e o risco real é o número ser banido, sem aviso e sem recurso. Uso normal (responder
// quem escreveu) raramente é atingido; disparo em massa é. Quem vende isto a um escritório
// precisa dizer isto a ele.
//
// O QUE NÃO MUDA. A Meta continua suportada e continua sendo o padrão (`provider = "META"`).
// Tudo o que vem depois da porta de entrada — atendimento, CRM, auditoria, o módulo pago — é o
// mesmo código para os dois. A diferença mora só aqui e no ramo de envio.
// ============================================================================

export type ConfigEvolution = {
  baseUrl: string;
  apiKey: string;
  instancia: string;
};

const ESPERA_MS = 20_000;

export class FalhaDaEvolution extends Error {
  constructor(public motivo: string) {
    super(motivo);
    this.name = "FalhaDaEvolution";
  }
}

// A barra final é removida sempre: `https://x/evolution` e `https://x/evolution/` têm que dar no
// mesmo lugar, e quem digita o endereço na tela não tem obrigação de saber disso.
function raiz(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function pedir(
  config: ConfigEvolution,
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<unknown> {
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), ESPERA_MS);
  try {
    const resposta = await fetch(`${raiz(config.baseUrl)}${caminho}`, {
      method: metodo,
      headers: {
        apikey: config.apiKey,
        "Content-Type": "application/json",
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controlador.signal,
      cache: "no-store",
    });

    const bruto = await resposta.text();
    let dados: unknown = null;
    try {
      dados = bruto ? JSON.parse(bruto) : null;
    } catch {
      // A Evolution responde JSON. Um HTML aqui quase sempre quer dizer que o endereço aponta
      // para o nginx e não para a API — vale dizer isso em vez de "erro ao interpretar".
      throw new FalhaDaEvolution(
        `o endereço ${raiz(config.baseUrl)} não respondeu como API (veio uma página). Confira o caminho no proxy.`,
      );
    }

    if (!resposta.ok) {
      const d = dados as { response?: { message?: unknown }; message?: unknown } | null;
      const detalhe = d?.response?.message ?? d?.message;
      const texto = Array.isArray(detalhe) ? detalhe.join("; ") : String(detalhe ?? `HTTP ${resposta.status}`);
      if (resposta.status === 401 || resposta.status === 403) {
        throw new FalhaDaEvolution("a chave da API da Evolution foi recusada.");
      }
      throw new FalhaDaEvolution(texto);
    }

    return dados;
  } catch (erro) {
    if (erro instanceof FalhaDaEvolution) throw erro;
    if (erro instanceof Error && erro.name === "AbortError") {
      throw new FalhaDaEvolution("a Evolution não respondeu a tempo.");
    }
    throw new FalhaDaEvolution(erro instanceof Error ? erro.message : "falha ao falar com a Evolution");
  } finally {
    clearTimeout(relogio);
  }
}

// ── Instância ────────────────────────────────────────────────────────────────────────────────

/**
 * Cria a instância JÁ com o webhook apontado para o Lúmen. Criar primeiro e configurar o webhook
 * depois é um convite a esquecer o segundo passo — e uma instância conectada sem webhook recebe
 * mensagens de cliente que não chegam a lugar nenhum.
 */
export async function criarInstancia(
  config: ConfigEvolution,
  webhook: { url: string; segredo: string },
): Promise<unknown> {
  return pedir(config, "POST", "/instance/create", {
    instanceName: config.instancia,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    // Grupos ficam de fora: o agente responder dentro de um grupo de WhatsApp é quase sempre
    // constrangimento, e nunca foi o que se pediu.
    groupsIgnore: true,
    // Não puxa o histórico inteiro do aparelho. Além de demorado, traria para dentro do CRM
    // conversas antigas que ninguém pediu para importar.
    syncFullHistory: false,
    webhook: {
      enabled: true,
      url: webhook.url,
      byEvents: false,
      base64: false,
      // O segredo viaja em cabeçalho próprio. É o que o Lúmen confere para saber que o pedido
      // veio desta instância, e não de alguém que descobriu o endereço.
      headers: { "x-lumen-evolution": webhook.segredo },
      events: ["MESSAGES_UPSERT"],
    },
  });
}

/** Devolve o QR code para ler no aparelho (ou nada, se a instância já estiver conectada). */
export async function conectar(config: ConfigEvolution): Promise<{ qrcode?: string; pareamento?: string }> {
  const d = (await pedir(config, "GET", `/instance/connect/${encodeURIComponent(config.instancia)}`)) as {
    base64?: string;
    code?: string;
    pairingCode?: string;
  } | null;
  return { qrcode: d?.base64, pareamento: d?.pairingCode ?? undefined };
}

export async function estadoDaInstancia(config: ConfigEvolution): Promise<string> {
  const d = (await pedir(config, "GET", `/instance/connectionState/${encodeURIComponent(config.instancia)}`)) as {
    instance?: { state?: string };
  } | null;
  return d?.instance?.state ?? "desconhecido";
}

export async function desconectar(config: ConfigEvolution): Promise<void> {
  await pedir(config, "DELETE", `/instance/logout/${encodeURIComponent(config.instancia)}`);
}

// ── Envio ────────────────────────────────────────────────────────────────────────────────

export async function enviarTexto(config: ConfigEvolution, paraE164: string, texto: string): Promise<string> {
  const d = (await pedir(config, "POST", `/message/sendText/${encodeURIComponent(config.instancia)}`, {
    number: somenteDigitos(paraE164),
    text: texto,
  })) as { key?: { id?: string } } | null;
  return d?.key?.id ?? "";
}

// F5 — MÍDIA DO WHATSAPP. A Evolution não manda o arquivo dentro do próprio webhook (ver
// `base64: false` em criarInstancia acima — decisão de não inchar todo evento com o peso de cada
// mídia, a maioria delas texto). Pra baixar o conteúdo é preciso pedir de volta, identificando a
// mensagem pela MESMA chave que veio no evento (remoteJid + id da mensagem) — é assim que a
// Evolution sabe qual mídia, já que ela guarda por um tempo curto, não por um id solto que dure.
export async function baixarMidiaEvolution(
  config: ConfigEvolution,
  midia: { remoteJid: string; waMessageId: string },
): Promise<{ buffer: Buffer; mimeType: string }> {
  const d = (await pedir(config, "POST", `/chat/getBase64FromMediaMessage/${encodeURIComponent(config.instancia)}`, {
    message: { key: { id: midia.waMessageId, remoteJid: midia.remoteJid } },
    convertToMp4: false,
  })) as { base64?: string; mimetype?: string } | null;
  if (!d?.base64) throw new FalhaDaEvolution("a Evolution não devolveu o conteúdo da mídia.");
  return { buffer: Buffer.from(d.base64, "base64"), mimeType: d.mimetype || "application/octet-stream" };
}

// ── Entrada ────────────────────────────────────────────────────────────────────────────────

export function somenteDigitos(numero: string): string {
  return (numero || "").replace(/\D+/g, "");
}

/**
 * Compara dois números de telefone do jeito que o WhatsApp brasileiro obriga.
 *
 * O NONO DÍGITO. Celular brasileiro tem 11 dígitos com o DDD (62 9 8128 3481), mas o WhatsApp
 * guarda MUITAS contas antigas com 10 (62 8128 3481) e é assim que o número chega no webhook.
 * Comparar as duas cadeias direto faz o sócio do escritório não ser reconhecido na lista de quem
 * pode ser atendido — e o sintoma seria "o agente ignora o Rodrigo", que ninguém liga ao nono
 * dígito. Por isso a comparação testa as duas formas.
 */
export function mesmoNumero(a: string, b: string): boolean {
  const x = somenteDigitos(a);
  const y = somenteDigitos(b);
  if (!x || !y) return false;
  if (x === y) return true;

  // Normaliza para "DDI + DDD + assinante", tirando o 9 extra quando ele existe.
  const semNono = (n: string): string => {
    // 55 + DDD(2) + 9 + 8 dígitos = 13. Só neste formato o 9 é o nono dígito.
    if (n.length === 13 && n.startsWith("55") && n[4] === "9") return n.slice(0, 4) + n.slice(5);
    return n;
  };
  return semNono(x) === semNono(y);
}

/**
 * Quem o agente pode responder.
 *
 * FECHADO POR PADRÃO, e a ordem importa: primeiro `ativo`, depois `todos`, e só então a lista.
 * Com `todos = false` e a lista vazia, a resposta é "ninguém" — o estado inseguro nunca é o
 * resultado de um campo esquecido.
 */
export function podeResponder(
  regra: { agenteAtivo: boolean; agenteTodos: boolean; agenteNumeros: string },
  deNumero: string,
): boolean {
  if (!regra.agenteAtivo) return false;
  if (regra.agenteTodos) return true;
  const lista = (regra.agenteNumeros || "")
    .split(/[,;\s]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  return lista.some((n) => mesmoNumero(n, deNumero));
}

// Um dos quatro tipos de mídia que a Baileys (motor por trás da Evolution) usa — a forma é a
// mesma nos quatro (mimetype; image/video/document ainda trazem caption; document também traz
// fileName). `documentWithCaptionMessage` é como o WhatsApp embrulha um documento MANDADO COM
// legenda — o documento de verdade fica um nível mais fundo, dentro de `.message.documentMessage`.
type EvolutionMediaField = { mimetype?: string; caption?: string; fileName?: string };

type EvolutionMessage = {
  conversation?: string;
  extendedTextMessage?: {
    text?: string;
    // A ORIGEM DO ANÚNCIO. Quem clica em "Enviar mensagem" num anúncio do Instagram ou do
    // Facebook chega com este bloco na PRIMEIRA mensagem, e só nela. É o `sourceUrl` daqui
    // que casa a conversa com a campanha cadastrada.
    contextInfo?: {
      externalAdReply?: { sourceUrl?: string; sourceId?: string; title?: string };
    };
  };
  imageMessage?: EvolutionMediaField;
  videoMessage?: EvolutionMediaField;
  audioMessage?: EvolutionMediaField;
  documentMessage?: EvolutionMediaField;
  documentWithCaptionMessage?: { message?: { documentMessage?: EvolutionMediaField } };
  // Figurinha — a Baileys não embrulha legenda nela (diferente de documentWithCaptionMessage).
  // Só a PRESENÇA do campo importa: ver a nota em ROTULO_FIGURINHA, lib/whatsapp.ts.
  stickerMessage?: { mimetype?: string };
};

type EnvelopeEvolution = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    message?: EvolutionMessage;
  };
};

/**
 * Lê o bloco de mídia (image/video/audio/document) de UMA mensagem da Evolution, pelos QUATRO
 * tipos que a F5 promete subir pro Drive — mesmo recorte de extrairMidiaMeta (lib/whatsapp.ts):
 * qualquer outro tipo (figurinha, localização, contato, reação, enquete...) é ignorado de
 * propósito. `null` quando nenhum dos quatro campos veio com `mimetype` — mensagem "vazia" de
 * mídia (ex.: `{ imageMessage: {} }`) acontece em evento de atualização de mensagem já entregue, e
 * não é mídia nova pra baixar.
 */
export function extrairMidiaEvolution(
  message?: EvolutionMessage
): { tipo: TipoMidiaWhatsapp; mimeType: string; legenda: string; nomeOriginal: string | null } | null {
  const documento = message?.documentMessage || message?.documentWithCaptionMessage?.message?.documentMessage;
  const campo: EvolutionMediaField | undefined = message?.imageMessage || message?.videoMessage || message?.audioMessage || documento;
  if (!campo?.mimetype) return null;

  const tipo: TipoMidiaWhatsapp = message?.imageMessage
    ? "IMG"
    : message?.videoMessage
      ? "VID"
      : message?.audioMessage
        ? "AUD"
        : "DOC";

  return { tipo, mimeType: campo.mimetype, legenda: campo.caption || "", nomeOriginal: campo.fileName || null };
}

/**
 * Traduz o webhook da Evolution para a MESMA forma que o da Meta produz, para que tudo o que vem
 * depois (`ingestIncomingWhatsapp`) não saiba de qual dos dois veio a mensagem.
 *
 * Devolve nulo para tudo o que não for texto, mídia (das quatro suportadas) OU figurinha, de
 * terceiro: eventos de status, localização/contato/reação/enquete/etc., mensagem de grupo
 * (`@g.us`) e — importante — mensagem enviada PELO próprio escritório (`fromMe`), que chega aqui
 * também e criaria um atendimento com o escritório como se fosse o cliente.
 */
export function parseEntradaEvolution(payload: unknown): IncomingMessage | null {
  try {
    const e = payload as EnvelopeEvolution;
    if (e?.event !== "messages.upsert") return null;

    const chave = e.data?.key;
    const jid = chave?.remoteJid || "";
    if (!jid || chave?.fromMe) return null;
    if (jid.endsWith("@g.us")) return null;
    if (!jid.endsWith("@s.whatsapp.net")) return null;

    const texto = e.data?.message?.conversation || e.data?.message?.extendedTextMessage?.text || "";
    const waMessageId = chave?.id || "";
    const instancia = e.instance || "";
    if (!waMessageId || !instancia) return null;

    const midia = extrairMidiaEvolution(e.data?.message);
    // FIGURINHA. A Baileys não bota legenda nela (diferente de documentWithCaptionMessage) — só a
    // presença do campo importa. Ver a nota em ROTULO_FIGURINHA, lib/whatsapp.ts.
    const figurinha = Boolean(e.data?.message?.stickerMessage);
    if (!texto.trim() && !midia && !figurinha) return null;

    const ad = e.data?.message?.extendedTextMessage?.contextInfo?.externalAdReply;

    return {
      fromNumber: jid.split("@")[0],
      waMessageId,
      text: midia ? midia.legenda : texto,
      profileName: e.data?.pushName || undefined,
      phoneNumberId: instancia,
      anuncio:
        ad?.sourceUrl || ad?.sourceId
          ? { sourceUrl: ad.sourceUrl, sourceId: ad.sourceId, titulo: ad.title }
          : undefined,
      midia: midia
        ? { tipo: midia.tipo, mimeType: midia.mimeType, nomeOriginal: midia.nomeOriginal, evolution: { remoteJid: jid, waMessageId } }
        : undefined,
      figurinha: figurinha ? true : undefined,
    };
  } catch {
    return null;
  }
}
