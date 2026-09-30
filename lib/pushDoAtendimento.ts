import { prisma } from "@/lib/prisma";
import { filtroDoAtendimento, nivelDeAcessoAoAtendimento } from "@/lib/acessoAtendimento";

// ============================================================================
// O AVISO DE MENSAGEM NOVA DO APLICATIVO DE ATENDIMENTO (Web Push).
//
// Quatro regras, todas travadas por lib/testes/atendimentoAppPush.teste.ts:
//
//  1. QUEM RECEBE é quem TEM ACESSO àquele atendimento, pela MESMA regra da lista e do chat
//     (`filtroDoAtendimento`): nível total vê todos; "próprios" só os seus; "nenhum" não recebe. Um
//     aviso que chega ao celular de quem não pode abrir a conversa é um vazamento de que aquela
//     conversa existe e de quando o cliente escreveu.
//
//  2. O CORPO NUNCA LEVA CONTEÚDO. Nem o texto da mensagem, nem o nome do cliente: o aviso passa pelo
//     serviço de push do Google/Apple e aparece na tela bloqueada. A carga é sempre a frase fixa abaixo;
//     o que muda é só a `tag` (agrupa por conversa) e o endereço que o toque abre. O service worker
//     (public/sw-atendimento.js) ignora qualquer outro texto que chegue na carga.
//
//  3. NUNCA ATRAPALHA O REGISTRO DA MENSAGEM. A função não lança, tem um relógio geral curto e cada envio
//     um tempo próprio; falha de push (rede, chave errada, serviço fora) vira log, jamais erro do webhook.
//     Inscrição que o serviço diz estar morta (404/410) é apagada.
//
//  4. SEM RAJADA. Se o cliente mandou outra mensagem nesta conversa na janela curta, o aviso anterior
//     ainda vale: não manda outro. Além disso a `tag` e o `topic` iguais fazem o aparelho e o serviço de
//     push trocarem o aviso antigo pelo novo em vez de empilhar.
//
// FAIL-CLOSED: sem VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT válidas nada é enviado nem
// inscrito, e a tela diz "indisponível neste servidor".
// ============================================================================

/** A frase que aparece na tela do aparelho. Fixa, de propósito: sem nome, sem texto. */
export const TITULO_DO_AVISO = "Lúmen Atendimento";
export const CORPO_DO_AVISO = "Nova mensagem no Atendimento";

/** Se o cliente já mandou outra mensagem nesta conversa dentro desta janela, o aviso anterior basta. */
export const JANELA_ANTI_RAJADA_MS = 30_000;
/** O relógio geral da função inteira: acabou o tempo, desiste (o webhook não espera mais que isto). */
export const LIMITE_GERAL_MS = 5_000;
/** O tempo de cada chamada ao serviço de push. */
export const LIMITE_POR_ENVIO_MS = 4_000;
/** Quanto tempo o serviço de push guarda o aviso se o aparelho estiver desligado. */
export const VALIDADE_DO_AVISO_S = 3_600;

// ── A CONFIGURAÇÃO (fail-closed) ────────────────────────────────────────────────────────────────────

export type ConfiguracaoVapid = { publica: string; privada: string; assunto: string };

/** Tira espaço, quebra de linha e aspas coladas junto do valor ao cadastrá-lo na Vercel. */
function limpar(bruto: string | undefined): string {
  return (bruto ?? "").replace(/["'\s]/g, "");
}

/**
 * Lê as três variáveis. `null` = fechado: falta alguma ou está malformada. Uma chave pública VAPID é um
 * ponto P-256 não comprimido (65 bytes, começando em 0x04); a privada tem 32 bytes; o assunto é
 * `mailto:` ou `https:` (o Apple recusa outro formato).
 */
export function lerConfiguracaoVapid(env: Record<string, string | undefined> = process.env): ConfiguracaoVapid | null {
  const publica = limpar(env.VAPID_PUBLIC_KEY);
  const privada = limpar(env.VAPID_PRIVATE_KEY);
  const assunto = (env.VAPID_SUBJECT ?? "").trim().replace(/^["']|["']$/g, "");
  if (!publica || !privada || !assunto) return null;
  try {
    const p = Buffer.from(publica, "base64url");
    if (p.length !== 65 || p[0] !== 0x04) return null;
    if (Buffer.from(privada, "base64url").length !== 32) return null;
  } catch {
    return null;
  }
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assunto) && !/^https:\/\/[^\s/]+/.test(assunto)) return null;
  return { publica, privada, assunto };
}

// ── A CARGA ─────────────────────────────────────────────────────────────────────────────────────────

export type CargaDoAviso = { tipo: "mensagem-nova"; title: string; body: string; tag: string; url: string };

/** `tag` e `url` são as ÚNICAS partes que dependem da conversa; o texto é sempre o mesmo. */
export function montarCargaDoAviso(attendanceId: string): CargaDoAviso {
  return { tipo: "mensagem-nova", title: TITULO_DO_AVISO, body: CORPO_DO_AVISO, tag: `atd-${attendanceId}`, url: `/atendimento-app/${attendanceId}` };
}

// ── QUEM RECEBE ─────────────────────────────────────────────────────────────────────────────────────

export type PessoaComAviso = {
  id: string;
  isAdmin: boolean;
  role: string | null;
  recebeTransferencia: boolean | null;
  active?: boolean;
};

/**
 * Quem, entre as pessoas do escritório, pode abrir ESTA conversa. É a regra do chat (`filtroDoAtendimento`)
 * aplicada a um atendimento só: sem filtro (total) vê; com filtro por dono, só se o dono é ela; o filtro
 * impossível de quem não tem acesso nunca casa.
 */
export function podeReceberOAviso(pessoa: PessoaComAviso, atendimento: { responsibleId: string | null }): boolean {
  if (pessoa.active === false) return false;
  if (nivelDeAcessoAoAtendimento(pessoa) === "nenhum") return false;
  const filtro = filtroDoAtendimento(pessoa, pessoa.id);
  if (filtro.responsibleId === undefined) return true;
  return atendimento.responsibleId !== null && atendimento.responsibleId === filtro.responsibleId;
}

// ── AS PORTAS (banco e serviço de push), injetáveis para o teste ────────────────────────────────────

export type InscricaoParaEnviar = { id: string; endpoint: string; p256dh: string; auth: string };
export type PessoaComInscricoes = PessoaComAviso & { inscricoes: InscricaoParaEnviar[] };

export type OpcoesDoEnvio = { timeout: number; TTL: number; urgency: "high" | "normal"; topic: string };
export type ErroDeEnvio = { statusCode?: number } | null | undefined;

export type PortasDoAviso = {
  /** O dono do atendimento (só o que a regra precisa) — `null` se não existe neste escritório. */
  atendimento(officeId: string, attendanceId: string): Promise<{ responsibleId: string | null } | null>;
  /** Quantas mensagens do CLIENTE nesta conversa chegaram desde `desde`, sem contar a que gerou o aviso. */
  entradasRecentes(attendanceId: string, desde: Date, menosEssa: string | null): Promise<number>;
  /** As pessoas ATIVAS do escritório que têm ao menos uma inscrição, já com elas. */
  pessoasComInscricao(officeId: string): Promise<PessoaComInscricoes[]>;
  /** Uma chamada ao serviço de push. Rejeita com `{statusCode}` quando ele recusa. */
  enviar(inscricao: InscricaoParaEnviar, carga: string, opcoes: OpcoesDoEnvio, vapid: ConfiguracaoVapid): Promise<void>;
  apagarInscricoes(ids: string[]): Promise<void>;
  marcarVistas(ids: string[], quando: Date): Promise<void>;
};

export type ResultadoDoAviso = { enviados: number; apagadas: number; motivo?: "sem-configuracao" | "sem-atendimento" | "rajada" | "sem-destinatario" | "erro" | "tempo" };

function comLimite<T>(promessa: Promise<T>, ms: number): Promise<{ tempo: true } | { tempo?: false; valor: T }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ tempo: true }), ms);
    promessa.then(
      (valor) => {
        clearTimeout(t);
        resolve({ valor });
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function avisar(
  entrada: { officeId: string; attendanceId: string; mensagemId: string | null; recebidaEm: Date },
  portas: PortasDoAviso,
  vapid: ConfiguracaoVapid,
): Promise<ResultadoDoAviso> {
  const atendimento = await portas.atendimento(entrada.officeId, entrada.attendanceId);
  if (!atendimento) return { enviados: 0, apagadas: 0, motivo: "sem-atendimento" };

  const antes = await portas.entradasRecentes(entrada.attendanceId, new Date(entrada.recebidaEm.getTime() - JANELA_ANTI_RAJADA_MS), entrada.mensagemId);
  if (antes > 0) return { enviados: 0, apagadas: 0, motivo: "rajada" };

  const pessoas = (await portas.pessoasComInscricao(entrada.officeId)).filter((p) => podeReceberOAviso(p, atendimento));
  const inscricoes = pessoas.flatMap((p) => p.inscricoes);
  if (inscricoes.length === 0) return { enviados: 0, apagadas: 0, motivo: "sem-destinatario" };

  const carga = JSON.stringify(montarCargaDoAviso(entrada.attendanceId));
  const opcoes: OpcoesDoEnvio = { timeout: LIMITE_POR_ENVIO_MS, TTL: VALIDADE_DO_AVISO_S, urgency: "high", topic: entrada.attendanceId.slice(0, 32) };
  const mortas: string[] = [];
  const boas: string[] = [];
  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await portas.enviar(i, carga, opcoes, vapid);
        boas.push(i.id);
      } catch (e) {
        const status = (e as ErroDeEnvio)?.statusCode;
        if (status === 404 || status === 410) mortas.push(i.id);
        else console.error(`[push atendimento] envio recusado (${status ?? "sem status"})`);
      }
    }),
  );
  if (mortas.length > 0) await portas.apagarInscricoes(mortas).catch(() => {});
  if (boas.length > 0) await portas.marcarVistas(boas, new Date()).catch(() => {});
  return { enviados: boas.length, apagadas: mortas.length };
}

/**
 * Avisa quem pode abrir a conversa que o cliente escreveu. NUNCA lança e NUNCA passa de `LIMITE_GERAL_MS`.
 * Chamada por `ingestIncomingWhatsapp` (o caminho único da Meta e da Evolution) depois de a mensagem estar
 * gravada; o chamador não precisa de `.catch`.
 */
export async function avisarMensagemNova(
  entrada: { officeId: string; attendanceId: string; mensagemId?: string | null; recebidaEm?: Date },
  portas: PortasDoAviso = portasReais,
  config: ConfiguracaoVapid | null = lerConfiguracaoVapid(),
  limiteMs: number = LIMITE_GERAL_MS,
): Promise<ResultadoDoAviso> {
  if (!config) return { enviados: 0, apagadas: 0, motivo: "sem-configuracao" };
  try {
    const r = await comLimite(
      avisar({ officeId: entrada.officeId, attendanceId: entrada.attendanceId, mensagemId: entrada.mensagemId ?? null, recebidaEm: entrada.recebidaEm ?? new Date() }, portas, config),
      limiteMs,
    );
    if (r.tempo) {
      console.error("[push atendimento] passou do tempo; o aviso foi abandonado");
      return { enviados: 0, apagadas: 0, motivo: "tempo" };
    }
    return r.valor;
  } catch (e) {
    console.error("[push atendimento] falha ao avisar:", e instanceof Error ? e.message : e);
    return { enviados: 0, apagadas: 0, motivo: "erro" };
  }
}

// ── AS PORTAS DE VERDADE ────────────────────────────────────────────────────────────────────────────

const portasReais: PortasDoAviso = {
  async atendimento(officeId, attendanceId) {
    const a = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId }, select: { responsibleId: true } });
    return a ? { responsibleId: a.responsibleId } : null;
  },
  async entradasRecentes(attendanceId, desde, menosEssa) {
    return prisma.whatsappMessage.count({
      where: { attendanceId, direction: "IN", createdAt: { gte: desde }, ...(menosEssa ? { id: { not: menosEssa } } : {}) },
    });
  },
  async pessoasComInscricao(officeId) {
    const usuarios = await prisma.user.findMany({
      where: { officeId, active: true, atendimentoPushInscricoes: { some: { officeId } } },
      select: {
        id: true,
        isAdmin: true,
        role: true,
        recebeTransferencia: true,
        active: true,
        atendimentoPushInscricoes: { where: { officeId }, select: { id: true, endpoint: true, p256dh: true, auth: true } },
      },
    });
    return usuarios.map(({ atendimentoPushInscricoes, ...u }) => ({ ...u, inscricoes: atendimentoPushInscricoes }));
  },
  async enviar(inscricao, carga, opcoes, vapid) {
    const webpush = (await import("web-push")).default;
    await webpush.sendNotification({ endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } }, carga, {
      vapidDetails: { subject: vapid.assunto, publicKey: vapid.publica, privateKey: vapid.privada },
      timeout: opcoes.timeout,
      TTL: opcoes.TTL,
      urgency: opcoes.urgency,
      topic: opcoes.topic,
    });
  },
  async apagarInscricoes(ids) {
    await prisma.atendimentoPushInscricao.deleteMany({ where: { id: { in: ids } } });
  },
  async marcarVistas(ids, quando) {
    await prisma.atendimentoPushInscricao.updateMany({ where: { id: { in: ids } }, data: { lastSeen: quando } });
  },
};
