import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { enviarTexto as enviarTextoEvolution, FalhaDaEvolution, mesmoNumero, baixarMidiaEvolution } from "@/lib/whatsappEvolution";
import { casarCampanha } from "@/lib/campanhas";
import { composePhoneWithDdi } from "@/lib/documentoEnvios";
import { deveExplicarAoColega, FRASE_AO_COLEGA } from "@/lib/avisoDeLead";
import { type TipoMidiaWhatsapp, montarNomeArquivoWhatsapp, rotuloDaMidiaWhatsapp } from "@/lib/driveNaming";
import { getOrCreateAttendanceFolder, uploadFileToDriveFolder, type StorageProvider } from "@/lib/storageProvider";

// ============================================================================
// Integração WhatsApp — DOIS provedores, uma porta só para o resto do sistema.
//
// META (Cloud API oficial) é o padrão e continua sendo o caminho de quem consegue cadastrar o
// número no Business Manager. EVOLUTION (WhatsApp Web, auto-hospedada) existe para quem não
// consegue — ver lib/whatsappEvolution.ts, que também explica o risco dessa escolha.
//
// A diferença entre os dois mora em DOIS lugares só: o ramo de envio, aqui embaixo, e a rota que
// recebe o webhook. Todo o resto — atendimento, CRM, auditoria, módulo pago, o agente — não sabe
// nem precisa saber por onde a mensagem entrou.
//
// ── Cloud API OFICIAL da Meta (Graph API)
//
// App Meta / WABA / webhook / app secret / verify token são únicos para toda a
// plataforma (variáveis de ambiente globais) — é o mesmo App Meta compartilhado
// por todos os escritórios. O que é por escritório é o NÚMERO de telefone: cada
// escritório cadastra seu próprio phoneNumberId + accessToken (tabela
// WhatsappConfig, ver prisma/schema.prisma), e é esse número que identifica a
// qual escritório uma mensagem recebida pertence.
// ============================================================================

const GRAPH_API_VERSION = "v21.0";

/** true somente quando o escritório já cadastrou seu número da Cloud API E o módulo WhatsApp está ligado. */
export async function isWhatsappConfigured(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { moduloWhatsapp: true, whatsappConfig: { select: { id: true } } },
  });
  return Boolean(office?.moduloWhatsapp && office.whatsappConfig);
}

/** Token esperado no handshake (GET) do webhook da Meta. Global — um único App Meta pra plataforma. */
export function getVerifyToken(): string | undefined {
  return process.env.WHATSAPP_VERIFY_TOKEN;
}

/**
 * Resolve a qual escritório pertence um phone_number_id recebido no webhook da Meta.
 * Retorna null também quando o módulo WhatsApp foi desligado para esse escritório depois
 * do número já ter sido configurado — a config fica guardada, mas para de processar mensagens.
 */
export async function resolveOfficeIdByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const config = await prisma.whatsappConfig.findUnique({
    where: { phoneNumberId },
    select: { officeId: true, office: { select: { moduloWhatsapp: true } } },
  });
  if (!config || !config.office.moduloWhatsapp) return null;
  return config.officeId;
}

// ---------------------------------------------------------------------------
// Envio de texto
// ---------------------------------------------------------------------------

export type SendResult = { ok: boolean; waMessageId?: string; error?: string };

// Forma parcial da resposta da Graph API (envio e erros).
type GraphResponse = {
  messages?: { id?: string }[];
  error?: {
    code?: number;
    error_subcode?: number;
    message?: string;
    error_data?: { details?: string };
  };
};

/**
 * Envia uma mensagem de texto simples pela Cloud API da Meta, usando o número
 * (phoneNumberId + accessToken) cadastrado pelo escritório.
 * Nunca lança: sempre resolve para { ok, ... }. Se não configurado, retorna
 * ok:false sem tocar na rede.
 */
export async function sendWhatsappText(officeId: string, toE164: string, body: string): Promise<SendResult> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { moduloWhatsapp: true } });
  if (!office?.moduloWhatsapp) {
    return { ok: false, error: "O módulo WhatsApp não está incluído no plano deste escritório." };
  }
  const config = await prisma.whatsappConfig.findUnique({ where: { officeId } });
  if (!config) {
    return { ok: false, error: "WhatsApp não configurado para este escritório." };
  }

  // O caminho da Evolution (WhatsApp Web) sai aqui. Do lado de fora desta função nada muda: quem
  // chama continua pedindo "manda este texto para este número neste escritório".
  if (config.provider === "EVOLUTION") {
    if (!config.baseUrl || !config.apiKey) {
      return { ok: false, error: "A conexão da Evolution está incompleta (endereço ou chave)." };
    }
    try {
      const waMessageId = await enviarTextoEvolution(
        { baseUrl: config.baseUrl, apiKey: config.apiKey, instancia: config.phoneNumberId },
        toE164,
        body,
      );
      return { ok: true, waMessageId };
    } catch (erro) {
      return { ok: false, error: erro instanceof FalhaDaEvolution ? erro.motivo : "falha ao enviar pela Evolution" };
    }
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164,
        type: "text",
        text: { body },
      }),
    });

    let data: GraphResponse | null = null;
    try {
      data = (await res.json()) as GraphResponse;
    } catch {
      // resposta sem corpo JSON — tratado abaixo
    }

    if (!res.ok) {
      const error = extractGraphError(data) || `Falha HTTP ${res.status} ao enviar mensagem.`;
      return { ok: false, error };
    }

    const waMessageId: string | undefined = data?.messages?.[0]?.id;
    return { ok: true, waMessageId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro de rede desconhecido";
    return { ok: false, error: `Falha ao contatar a API do WhatsApp: ${message}` };
  }
}

/** Extrai uma mensagem de erro legível do payload de erro da Graph API. */
function extractGraphError(data: GraphResponse | null): string | null {
  const err = data?.error;
  if (!err) return null;
  // Detecção tolerante da janela de 24h (fora da conversa aberta pelo cliente).
  // Códigos típicos: 131047 ("Message failed to send because more than 24 hours
  // have passed since the customer last replied") / 131051 / mensagens contendo "24".
  const code = err.code ?? err.error_subcode;
  const raw = `${err.message ?? ""} ${err.error_data?.details ?? ""}`.toLowerCase();
  const outsideWindow =
    code === 131047 ||
    code === 131051 ||
    raw.includes("24 hour") ||
    raw.includes("24 hours") ||
    raw.includes("24h") ||
    (raw.includes("re-engagement") && raw.includes("message")) ||
    raw.includes("outside the allowed window");
  if (outsideWindow) {
    return "Não foi possível enviar: fora da janela de 24h do WhatsApp — o cliente precisa enviar uma nova mensagem primeiro.";
  }
  return err.message || err.error_data?.details || null;
}

// ---------------------------------------------------------------------------
// Validação de assinatura do webhook (X-Hub-Signature-256)
// ---------------------------------------------------------------------------

/**
 * Valida a assinatura HMAC-SHA256 do corpo bruto enviado pela Meta.
 * Fail-closed (achado F2 da auditoria de segurança, docs/security-audit/): sem
 * WHATSAPP_APP_SECRET configurado, a requisição é recusada — mesmo padrão já usado por
 * ASAAS_WEBHOOK_TOKEN (lib/asaas.ts). Antes disto, ausência do secret fazia a rota aceitar
 * qualquer POST não autenticado, permitindo injetar mensagem forjada num Atendimento real de
 * um escritório com o módulo WhatsApp ativo.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false; // sem secret configurado → recusa (fail-closed)
  if (!signatureHeader) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual exige tamanhos iguais
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Parsing do webhook de entrada
// ---------------------------------------------------------------------------

// F5 — MÍDIA DO WHATSAPP. Um dos dois campos é preenchido, nunca os dois — cada mensagem chega por
// UMA porta só (Meta OU Evolution), e cada porta guarda o identificador que a SUA API de download
// exige de volta (a Meta baixa por `mediaId`; a Evolution, pela chave da mensagem — remoteJid + id
// — porque ela não devolve o arquivo dentro do próprio webhook, ver lib/whatsappEvolution.ts).
export type IncomingMidia = {
  tipo: TipoMidiaWhatsapp;
  mimeType: string;
  /** Nome que o cliente deu ao arquivo — hoje só "documento" costuma trazer isto. */
  nomeOriginal: string | null;
  mediaId?: string;
  evolution?: { remoteJid: string; waMessageId: string };
};

export type IncomingMessage = {
  fromNumber: string;
  waMessageId: string;
  /** Corpo de texto (mensagem de texto) ou legenda (mensagem de mídia — "" quando não há legenda). */
  text: string;
  profileName?: string;
  phoneNumberId: string;
  /**
   * De onde a conversa veio, quando veio de um anúncio. SÓ A PRIMEIRA MENSAGEM traz isto — nem a
   * Meta nem o WhatsApp repetem a origem nas seguintes. Por isso ela é gravada no atendimento na
   * hora em que ele nasce.
   */
  anuncio?: { sourceUrl?: string; sourceId?: string; titulo?: string };
  /** Presente quando a mensagem trouxe imagem/documento/áudio/vídeo (ver extrairMidiaMeta). */
  midia?: IncomingMidia;
};

// Um dos quatro campos de mídia que a Meta manda, conforme `message.type` — a forma é a mesma nos
// quatro (id + mime_type, e document/image/video ainda trazem caption; document também traz
// filename). Ver https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples.
type MetaMediaField = { id?: string; mime_type?: string; caption?: string; filename?: string };

// UMA mensagem do array `messages` do webhook da Meta — nome próprio (em vez de inline) porque
// extrairMidiaMeta também recebe este tipo, e o Payload inteiro fica mais simples de ler com ele
// já nomeado.
type MetaMessage = {
  type?: string;
  from?: string;
  id?: string;
  text?: { body?: string };
  image?: MetaMediaField;
  video?: MetaMediaField;
  audio?: MetaMediaField;
  document?: MetaMediaField;
  // Click-to-WhatsApp da Meta: a origem vem aqui, e só na primeira mensagem.
  referral?: { source_url?: string; source_id?: string; headline?: string };
};

// Forma parcial do payload de webhook da Meta que nos interessa.
type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaMessage[];
        contacts?: { profile?: { name?: string } }[];
      };
    }[];
  }[];
};

/**
 * Lê o bloco de mídia (image/video/audio/document) de UMA mensagem da Meta, pelos QUATRO tipos que
 * a F5 promete subir pro Drive — os únicos que o pedido do dono cobre. Qualquer outro tipo
 * (sticker, location, contacts, reaction, interactive, unsupported...) é ignorado de propósito:
 * cobrir mídia que não foi pedida é mais superfície pra manter sem ganho nenhum. `null` quando o
 * tipo não é um dos quatro, ou quando o bloco não trouxe o mínimo pra baixar o arquivo (id + MIME).
 */
export function extrairMidiaMeta(
  message: MetaMessage
): { tipo: TipoMidiaWhatsapp; mimeType: string; legenda: string; nomeOriginal: string | null; mediaId: string } | null {
  const campo: MetaMediaField | undefined =
    message?.type === "image"
      ? message.image
      : message?.type === "video"
        ? message.video
        : message?.type === "audio"
          ? message.audio
          : message?.type === "document"
            ? message.document
            : undefined;
  if (!campo?.id || !campo.mime_type) return null;

  const tipo: TipoMidiaWhatsapp =
    message.type === "image" ? "IMG" : message.type === "video" ? "VID" : message.type === "audio" ? "AUD" : "DOC";

  return { tipo, mimeType: campo.mime_type, legenda: campo.caption || "", nomeOriginal: campo.filename || null, mediaId: campo.id };
}

/**
 * Extrai a primeira mensagem processável (texto OU mídia) de um payload de webhook da Meta.
 * Retorna null para o que não é nenhum dos dois (ex.: eventos de status de entrega, sticker,
 * localização...), sinalizando "nada a fazer".
 */
export function parseIncoming(payload: unknown): IncomingMessage | null {
  try {
    const value = (payload as WebhookPayload)?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return null;

    const fromNumber: string | undefined = message.from;
    const waMessageId: string | undefined = message.id;
    const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
    if (!fromNumber || !waMessageId || !phoneNumberId) return null;

    const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;
    const ref = message.referral;
    const anuncio =
      ref?.source_url || ref?.source_id
        ? { sourceUrl: ref.source_url, sourceId: ref.source_id, titulo: ref.headline }
        : undefined;

    if (message.type === "text") {
      const text = message.text?.body;
      if (!text) return null;
      return { fromNumber, waMessageId, text, profileName, phoneNumberId, anuncio };
    }

    const midia = extrairMidiaMeta(message);
    if (!midia) return null;

    return {
      fromNumber,
      waMessageId,
      text: midia.legenda,
      profileName,
      phoneNumberId,
      anuncio,
      midia: { tipo: midia.tipo, mimeType: midia.mimeType, nomeOriginal: midia.nomeOriginal, mediaId: midia.mediaId },
    };
  } catch {
    return null;
  }
}

const GRAPH_API_BASE = "https://graph.facebook.com";

/**
 * Baixa o conteúdo de uma mídia da Cloud API da Meta — em DOIS pedidos, porque é assim que a API
 * funciona: o webhook só traz o `mediaId`; o primeiro pedido troca esse id por uma URL temporária
 * (poucos minutos de validade — por isso não dá pra guardar essa URL para baixar depois, o download
 * acontece agora, dentro do mesmo pedido do webhook); o segundo baixa o arquivo de verdade dessa
 * URL, com o MESMO token de acesso do app.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#download-media
 */
export async function baixarMidiaMeta(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) throw new Error(`Falha ao consultar metadados da mídia na Meta (HTTP ${metaRes.status}).`);
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) throw new Error("A Meta não devolveu a URL de download da mídia.");

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) throw new Error(`Falha ao baixar a mídia da Meta (HTTP ${fileRes.status}).`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type || "application/octet-stream" };
}

// ---------------------------------------------------------------------------
// Ingestão de mensagem de entrada → Atendimento
// ---------------------------------------------------------------------------

// ============================================================================
// QUANDO É ALGUÉM DO ESCRITÓRIO QUE ESCREVE PARA O NÚMERO DO ATENDIMENTO.
//
// O aviso de lead sai por este mesmo número — o mesmo por onde os clientes falam. Responder a um
// aviso é o primeiro reflexo de qualquer pessoa, e sem esta trava o "ok, já vou" do advogado
// viraria um LEAD no funil, com o nome dele, e o atendente de IA começaria a triá-lo como
// cliente. As duas coisas são constrangedoras, e as duas alguém tem de desfazer à mão.
//
// Sai UMA frase, e depois silêncio — com uma folga de 24h, porque silêncio para sempre faria
// quem escrevesse de novo daqui a seis meses concluir que o número quebrou.
// ============================================================================
async function ehMensagemDaEquipe(officeId: string, deNumero: string): Promise<boolean> {
  try {
    const equipe = await prisma.user.findMany({
      where: { officeId, active: true, phone: { not: null } },
      select: { id: true, phone: true, phoneDdi: true, avisoAutomaticoEm: true },
    });

    const colega = equipe.find((u) => mesmoNumero(composePhoneWithDdi(u.phoneDdi, u.phone || ""), deNumero));
    if (!colega) return false;

    const agora = new Date();
    if (!deveExplicarAoColega(colega.avisoAutomaticoEm, agora)) return true;

    // A marca é gravada ANTES do envio, e o `where` repete o valor lido. Duas mensagens seguidas
    // do mesmo colega chegam em dois pedidos que correm ao mesmo tempo; gravar depois faria os
    // dois passarem pela condição e a frase sair em dobro — que é exatamente o que ela evita.
    const marcou = await prisma.user.updateMany({
      where: { id: colega.id, avisoAutomaticoEm: colega.avisoAutomaticoEm },
      data: { avisoAutomaticoEm: agora },
    });
    if (marcou.count === 0) return true;

    const envio = await sendWhatsappText(officeId, deNumero, FRASE_AO_COLEGA);
    if (!envio.ok) console.error(`[whatsapp] falha ao explicar ao colega: ${envio.error || "erro"}`);
    return true;
  } catch (e) {
    // EM CASO DE FALHA, A MENSAGEM SEGUE COMO LEAD. É a menos ruim das duas: tratar a dúvida como
    // "é da equipe" faria a mensagem de um CLIENTE de verdade sumir em silêncio numa oscilação do
    // banco — ninguém saberia, e o cliente iria embora. O erro na outra direção cria um lead com
    // o nome de um advogado, que qualquer pessoa vê na tela e arquiva em dois cliques.
    console.error("[whatsapp] falha ao verificar se o número é da equipe:", e);
    return false;
  }
}

/**
 * Transforma uma mensagem de entrada do cliente em um WhatsappMessage vinculado
 * a um Atendimento (criando um novo Atendimento se não houver conversa aberta).
 * Idempotente por waMessageId. Não faz IA nem distribuição (fases B/C).
 */
export async function ingestIncomingWhatsapp({
  fromNumber,
  waMessageId,
  text,
  profileName,
  phoneNumberId,
  anuncio,
  midia,
}: IncomingMessage): Promise<string | null> {
  // Dedupe: reenvio da Meta não deve reprocessar. Devolve nulo também aqui: uma mensagem repetida
  // não pode acionar o atendente de novo, senão o cliente recebe duas respostas iguais.
  const existing = await prisma.whatsappMessage.findUnique({ where: { waMessageId } });
  if (existing) return null;

  const officeId = await resolveOfficeIdByPhoneNumberId(phoneNumberId);
  if (!officeId) {
    console.error(`[whatsapp] mensagem recebida em phone_number_id ${phoneNumberId} sem escritório cadastrado — ignorada.`);
    return null;
  }

  // QUEM ESCREVEU É DA CASA? Esta pergunta vem ANTES de o atendimento nascer, e mora aqui — e não
  // nas rotas — porque são duas rotas (Meta e Evolution) chamando esta função, e um dia serão
  // três. Trava que só existe numa das portas não é trava.
  if (await ehMensagemDaEquipe(officeId, fromNumber)) return null;

  // Procura conversa aberta (não arquivada) para este telefone; a mais recente.
  let attendance = await prisma.attendance.findFirst({
    where: { officeId, waPhone: fromNumber, status: { not: "ARQUIVADO" } },
    orderBy: { createdAt: "desc" },
  });

  if (!attendance) {
    // A CAMPANHA É DECIDIDA AQUI, UMA VEZ SÓ. Conversa que já existe não é reavaliada: a origem
    // do anúncio não volta nas mensagens seguintes, e reavaliar só criaria o risco de uma
    // conversa trocar de roteiro no meio.
    const campanhas = await prisma.campanha.findMany({
      where: { officeId, ativa: true },
      select: { id: true, ativa: true, inicioEm: true, fimEm: true, sourceUrl: true, textoDoClique: true, createdAt: true },
    });
    const casamento = casarCampanha(campanhas, { sourceUrl: anuncio?.sourceUrl, texto: text }, new Date());

    attendance = await prisma.attendance.create({
      data: {
        officeId,
        clientName: profileName || fromNumber,
        contact: fromNumber,
        subject: "Atendimento via WhatsApp",
        channel: "WHATSAPP",
        status: "NOVO",
        leadSource: "WHATSAPP",
        waPhone: fromNumber,
        stageChangedAt: new Date(),
        campanhaId: casamento?.campanhaId ?? null,
        // A origem crua fica guardada mesmo sem casar com campanha nenhuma: é o que permite
        // descobrir, depois, POR QUE uma conversa vinda de anúncio não casou.
        anuncioSourceUrl: anuncio?.sourceUrl ?? null,
        anuncioSourceId: anuncio?.sourceId ?? null,
        anuncioTitulo: anuncio?.titulo ?? null,
      },
    });
  }

  const recebidoEm = new Date();

  const novaMensagem = await prisma.whatsappMessage.create({
    data: {
      officeId,
      attendanceId: attendance.id,
      direction: "IN",
      // Mídia não tem como virar texto (WhatsappMessage.body é NOT NULL) — vira um rótulo
      // ("[imagem]", "[documento: nome.pdf]"...) com a legenda junto, se houver. O arquivo de
      // verdade mora no Attachment que processarMidiaRecebida cria logo abaixo.
      body: midia ? rotuloDaMidiaWhatsapp(midia.tipo, text, midia.nomeOriginal) : text,
      waMessageId,
      status: "RECEIVED",
      fromNumber,
    },
  });

  await prisma.attendance.update({
    where: { id: attendance.id },
    data: { waLastMessageAt: new Date() },
  });

  // F5 — MÍDIA DO WHATSAPP NO DRIVE. Sobe AGORA, no mesmo pedido do webhook, e não numa fila: a
  // URL de mídia da Meta expira em minutos, e a Evolution só guarda o arquivo por um tempo curto —
  // adiar para depois seria arriscar não ter mais o arquivo pra baixar quando a fila rodasse.
  // Nunca lança: a mensagem já ficou registrada acima (o cliente não perde o rastro da conversa),
  // então uma falha aqui vira log, não erro que derruba o webhook nem impede o atendente de
  // responder.
  //
  // A TRANSCRIÇÃO DE ÁUDIO NÃO ACONTECE AQUI — DE PROPÓSITO. Rodar a chamada de transcrição (e a
  // do Hermes, para compor a resposta de verdade) dentro deste pedido colocava dois relógios
  // independentes (até 105s do Hermes, até 60s da transcrição) somando mais que os 120s de
  // `maxDuration` da rota — a plataforma podia matar a função ANTES de o Hermes responder, e o
  // cliente ficava SEM RESPOSTA NENHUMA, pior que o problema que esta entrega resolve. Por isso o
  // desenho é: cria o registro PENDENTE aqui (rápido, só grava no banco), e quem chama esta função
  // (a rota do webhook) manda uma confirmação FIXA na hora e dispara o processamento de verdade
  // fora deste pedido — ver lib/transcricaoAssincrona.ts e o comentário em
  // app/api/transcricao/processar/route.ts.
  if (midia) {
    const baixado = await baixarMidiaDoWhatsapp(officeId, midia).catch((e) => {
      console.error(`[whatsapp] falha ao baixar a mídia da mensagem ${waMessageId}:`, e);
      return null;
    });

    let uploadInfo: { storageProvider: StorageProvider; storageFileId: string } | null = null;
    if (baixado) {
      uploadInfo = await processarMidiaRecebida(officeId, attendance.id, attendance.subject, waMessageId, midia, recebidoEm, baixado).catch((e) => {
        console.error(`[whatsapp] falha ao subir a mídia da mensagem ${waMessageId} para o Drive:`, e);
        return null;
      });
    }

    if (midia.tipo === "AUD") {
      // SÓ O REGISTRO NASCE AQUI — status PENDENTE, e a referência de onde o áudio está guardado
      // no Drive (nula quando o upload acima falhou: sem cópia durável, não há de onde a
      // transcrição assíncrona ler o arquivo depois, e ela falha honestamente por causa disso).
      await prisma.transcricaoDeAudio
        .create({
          data: {
            whatsappMessageId: novaMensagem.id,
            officeId,
            status: "PENDENTE",
            storageProvider: uploadInfo?.storageProvider ?? null,
            storageFileId: uploadInfo?.storageFileId ?? null,
          },
        })
        .catch((e) => {
          console.error(`[whatsapp] falha ao criar o registro de transcrição da mensagem ${waMessageId}:`, e);
        });
    }
  }

  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${attendance.id}`);

  // Devolve o atendimento para quem chamou poder acionar o atendente de IA. A decisão de
  // responder NÃO é tomada aqui: guardar a mensagem e responder a ela são trabalhos diferentes,
  // e o primeiro tem que acontecer mesmo quando o segundo falha.
  return attendance.id;
}

/**
 * F5 — sobe pro Drive/OneDrive/Dropbox do escritório a mídia JÁ BAIXADA (por baixarMidiaDoWhatsapp,
 * mais abaixo neste arquivo, chamada uma vez só em ingestIncomingWhatsapp), na pasta do PRÓPRIO
 * atendimento — criada agora, se ainda não existir, mesmo que o atendimento acabou de nascer (item
 * 3 do pedido: a pasta nasce desde o início da conversa, não só quando o lead vira cliente/
 * processo; item 4 — a pasta ser RENOMEADA quando ele deixa de ser só um lead — já é o que
 * convertAttendanceToCase, em lib/actions/attendance.ts, faz com QUALQUER pasta de atendimento que
 * já exista, sem saber nem precisar saber como ela nasceu).
 *
 * DEVOLVE onde o arquivo ficou (provedor + id) — é essa referência que ingestIncomingWhatsapp
 * grava em TranscricaoDeAudio quando a mídia é um áudio: a transcrição roda depois, fora deste
 * pedido (ver lib/transcricaoAssincrona.ts), e lê o arquivo DAQUI (do Drive, que não expira), não
 * baixando de novo da Meta/Evolution (cuja URL já teria expirado a essa altura).
 */
async function processarMidiaRecebida(
  officeId: string,
  attendanceId: string,
  subject: string,
  waMessageId: string,
  midia: IncomingMidia,
  recebidoEm: Date,
  baixado: { buffer: Buffer; mimeType: string },
): Promise<{ storageProvider: StorageProvider; storageFileId: string }> {
  const nomeArquivo = montarNomeArquivoWhatsapp({
    recebidoEm,
    // O MIME devolvido no DOWNLOAD é a fonte mais confiável (vem do arquivo de verdade); o do
    // webhook é só um aviso prévio — os dois quase sempre batem, mas o download manda quando
    // divergirem.
    mimeType: baixado.mimeType || midia.mimeType,
    waMessageId,
    nomeOriginal: midia.nomeOriginal,
  });

  const folderId = await getOrCreateAttendanceFolder(attendanceId, subject, officeId);
  const upload = await uploadFileToDriveFolder(nomeArquivo, baixado.mimeType || midia.mimeType, baixado.buffer, folderId, officeId);

  await prisma.attachment.create({
    data: {
      officeId,
      attendanceId,
      name: nomeArquivo,
      driveUrl: upload.webViewLink,
      docType: "MIDIA_WHATSAPP",
      storageProvider: upload.storageProvider,
      storageFileId: upload.id,
    },
  });

  revalidatePath(`/atendimento/${attendanceId}`);

  return { storageProvider: upload.storageProvider, storageFileId: upload.id };
}

/**
 * F5 — baixa a mídia (na porta certa, conforme onde ela chegou), chamada UMA VEZ SÓ por mensagem,
 * em ingestIncomingWhatsapp.
 *
 * `null` sem lançar quando falta config/credencial pro provedor certo (a mensagem só chegou
 * porque ALGUM config existe — isto cobre o caso raro de ele ter sido apagado/incompleto entre a
 * mensagem chegar e este código rodar). Falha de REDE de verdade (Meta/Evolution fora do ar)
 * continua lançando — quem chama já trata com `.catch()`.
 */
async function baixarMidiaDoWhatsapp(officeId: string, midia: IncomingMidia): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const config = await prisma.whatsappConfig.findUnique({ where: { officeId } });
  if (!config) return null; // não deveria acontecer — a mensagem só chegou porque este config existe

  if (config.provider === "EVOLUTION") {
    if (!config.baseUrl || !config.apiKey || !midia.evolution) return null;
    return baixarMidiaEvolution({ baseUrl: config.baseUrl, apiKey: config.apiKey, instancia: config.phoneNumberId }, midia.evolution);
  }
  if (!midia.mediaId) return null;
  return baixarMidiaMeta(midia.mediaId, config.accessToken);
}
