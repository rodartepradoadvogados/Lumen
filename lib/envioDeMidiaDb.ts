import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { registrarMensagem } from "@/lib/registrarMensagem";
import { sendWhatsappMedia, type SendResult } from "@/lib/whatsapp";
import type { MidiaParaEnviar } from "@/lib/whatsappEvolution";
import { silenciarAtendente } from "@/lib/atendenteResponde";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { prepararMensagem, type MensagemDoChat } from "@/lib/mensagensDoChat";
import { ehErroDeJanela } from "@/lib/janelaDe24h";
import { decidirSobreOPedido, type CodigoDeEnvio } from "@/lib/envioDeMensagem";
import { janelaDaConversa, type RespostaDoEnvio } from "@/lib/envioDeMensagemDb";
import { classificarArquivoDeSaida, LIMITE_DA_PLATAFORMA_BYTES, temporarioEDesta, validarLegenda, type PedidoDeMidia, type ProvedorDoWhatsapp, type TipoDeSaida } from "@/lib/midiaDeSaida";
import { conferirConteudo } from "@/lib/midiaDeSaidaConteudo";
import { isValidBlobUrl } from "@/lib/blobUrl";
import { montarNomeArquivoWhatsapp, rotuloDaMidiaWhatsapp, type TipoMidiaWhatsapp } from "@/lib/driveNaming";
import { getOrCreateAttendanceFolder, uploadFileToDriveFolder } from "@/lib/storageProvider";

// ============================================================================
// O LADO DE BANCO DO ENVIO DE MÍDIA AO CLIENTE PELO APLICATIVO (R3, PR 14).
//
// Mesma espinha do texto (lib/envioDeMensagemDb.ts) — a ORDEM é o que protege o cliente e o escritório:
//   0. (a rota já passou por `atendimentoDaRota`: 401 / 403 / 404 ANTES de ler o corpo)
//   1. o arquivo temporário é DESTA conversa e DESTA chave? (prefixo do caminho no Blob) — senão 400, nada é baixado
//   2. baixa o temporário (com teto) e CONFERE no servidor: extensão na lista do provedor, tamanho real por tipo,
//      assinatura do conteúdo (programa/página/SVG recusados até com nome de imagem), legenda
//   3. a chave já existe? -> decide (já saiu / falhou / em curso / sem confirmação / OUTRO CONTEÚDO na mesma chave).
//      O que vale como "conteúdo" é o hash do arquivo + nome + legenda + tipo (não só a legenda)
//   4. a janela de 24 h (só Meta) -> senão recusa SEM reservar
//   5. limite de envios por minuto e por hora, por pessoa -> senão 429 SEM reservar
//   6. RESERVA a chave (linha única) ANTES de chamar o provedor; só quem reservou envia
//   7. envia. Sem resposta = `incerto` = "sem confirmação" (ação humana para repetir)
//   8. ENVIADO; guarda a cópia no Drive do atendimento (o histórico do que o cliente recebeu); grava a mensagem por
//      `registrarMensagem` (a única porta); a pessoa assume a conversa — só porque deu certo
//   9. SEMPRE, no fim (dê certo ou não), apaga o arquivo temporário do Blob
//
// O arquivo NUNCA é registrado em log, nem o token; o erro do provedor é cortado em 500 caracteres.
// ============================================================================

export type AutorizadoDeMidia = {
  officeId: string;
  userId: string;
  attendance: { id: string; waPhone: string | null; firstResponseAt: Date | null; subject: string };
};

export const MAX_MIDIAS_POR_MINUTO = 8;
export const MAX_MIDIAS_POR_HORA = 60;
/** O `textoHash` de um pedido de mídia começa por isto: separa de texto e deixa contar os envios de arquivo por pessoa. */
export const PREFIXO_DO_HASH_DE_MIDIA = "m1:";

const TIPO_DO_DRIVE: Record<TipoDeSaida, TipoMidiaWhatsapp> = { imagem: "IMG", video: "VID", audio: "AUD", documento: "DOC" };

export function hashDoPedidoDeMidia(m: { tipo: TipoDeSaida; nome: string; legenda: string; buffer: Uint8Array }): string {
  const conteudo = createHash("sha256").update(m.buffer).digest("hex");
  return PREFIXO_DO_HASH_DE_MIDIA + createHash("sha256").update(`${m.tipo}\u0000${m.nome}\u0000${m.legenda}\u0000${conteudo}`, "utf8").digest("hex");
}

export type ResultadoDoDownload = { ok: true; buffer: Buffer } | { ok: false; motivo: "grande" | "falha" };

export type PortasDaMidiaDeSaida = {
  /** Lê o temporário. O teto é de bytes; passar dele = "grande" (sem carregar o resto). */
  baixar: (url: string, limiteBytes: number) => Promise<ResultadoDoDownload>;
  /** Apaga o temporário. Nunca lança para quem chama. */
  apagar: (url: string) => Promise<void>;
  enviar: (officeId: string, para: string, midia: MidiaParaEnviar) => Promise<SendResult>;
  /** Guarda a cópia do que foi enviado no Drive do atendimento. Nulo = não guardou (a mensagem sai registrada mesmo assim). */
  guardarNoDrive: (q: { officeId: string; userId: string; attendanceId: string; assunto: string; nomeNoDrive: string; mime: string; buffer: Buffer; tipo: TipoDeSaida; quando: Date }) => Promise<{ attachmentId: string } | null>;
};

const ESPERA_DO_DOWNLOAD_MS = 40_000;

async function baixarDoBlob(url: string, limiteBytes: number): Promise<ResultadoDoDownload> {
  if (!isValidBlobUrl(url)) return { ok: false, motivo: "falha" };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ESPERA_DO_DOWNLOAD_MS);
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "error", signal: c.signal });
    if (!res.ok || !res.body) return { ok: false, motivo: "falha" };
    const declarado = Number(res.headers.get("content-length") || 0);
    if (declarado > limiteBytes) {
      await res.body.cancel().catch(() => {});
      return { ok: false, motivo: "grande" };
    }
    const partes: Uint8Array[] = [];
    let total = 0;
    const leitor = res.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.length;
      if (total > limiteBytes) {
        await leitor.cancel().catch(() => {});
        return { ok: false, motivo: "grande" };
      }
      partes.push(value);
    }
    return { ok: true, buffer: Buffer.concat(partes) };
  } catch {
    return { ok: false, motivo: "falha" };
  } finally {
    clearTimeout(t);
  }
}

async function apagarDoBlob(url: string): Promise<void> {
  try {
    if (isValidBlobUrl(url)) await del(url);
  } catch (e) {
    // O temporário fica no Blob (endereço não adivinhável). Nunca derruba o envio já feito.
    console.error("[midia-saida] não foi possível apagar o arquivo temporário:", mensagemDeErro(e));
  }
}

async function guardarNoDriveDoAtendimento(q: Parameters<PortasDaMidiaDeSaida["guardarNoDrive"]>[0]): Promise<{ attachmentId: string } | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const pasta = await getOrCreateAttendanceFolder(q.attendanceId, q.assunto, q.officeId);
      const up = await uploadFileToDriveFolder(q.nomeNoDrive, q.mime, q.buffer, pasta, q.officeId);
      const anexo = await prisma.attachment.create({
        data: {
          officeId: q.officeId,
          attendanceId: q.attendanceId,
          name: q.nomeNoDrive,
          driveUrl: up.webViewLink,
          docType: "MIDIA_WHATSAPP",
          uploadedById: q.userId,
          storageProvider: up.storageProvider,
          storageFileId: up.id,
        },
        select: { id: true },
      });
      return { attachmentId: anexo.id };
    } catch (e) {
      console.error("[midia-saida] a cópia no Drive falhou:", mensagemDeErro(e));
    }
  }
  return null;
}

export const PORTAS_REAIS_DA_MIDIA_DE_SAIDA: PortasDaMidiaDeSaida = {
  baixar: baixarDoBlob,
  apagar: apagarDoBlob,
  enviar: sendWhatsappMedia,
  guardarNoDrive: guardarNoDriveDoAtendimento,
};

function recusa(status: number, codigo: CodigoDeEnvio, erro: string): RespostaDoEnvio {
  return { status, corpo: { ok: false, codigo, erro } };
}

const FRASE_SEM_CONFIRMACAO = "Não se sabe se este arquivo saiu. Confira a conversa antes de repetir.";
const FRASE_EM_ANDAMENTO = "Este arquivo ainda está sendo enviado.";

/** O nome do arquivo no Drive: o padrão da mídia do WhatsApp (data, canal, tipo) com o nome original + 6 caracteres da chave (nunca colide). */
function nomeNoDrive(pedido: { clientMessageId: string; nome: string }, mime: string, tipo: TipoDeSaida, quando: Date): string {
  const ponto = pedido.nome.lastIndexOf(".");
  const base = ponto > 0 ? pedido.nome.slice(0, ponto) : pedido.nome;
  const ext = ponto > 0 ? pedido.nome.slice(ponto + 1) : "";
  const original = `${base}-${pedido.clientMessageId.slice(0, 6)}${ext ? `.${ext}` : ""}`;
  void tipo;
  return montarNomeArquivoWhatsapp({ recebidoEm: quando, mimeType: mime, waMessageId: pedido.clientMessageId, nomeOriginal: original });
}

export async function enviarMidiaDoApp(
  a: AutorizadoDeMidia,
  pedido: PedidoDeMidia,
  opcoes: { agora?: Date; portas?: Partial<PortasDaMidiaDeSaida> } = {},
): Promise<RespostaDoEnvio> {
  const agora = opcoes.agora ?? new Date();
  const portas: PortasDaMidiaDeSaida = { ...PORTAS_REAIS_DA_MIDIA_DE_SAIDA, ...opcoes.portas };
  const chave = { officeId: a.officeId, clientMessageId: pedido.clientMessageId };

  if (!a.attendance.waPhone) return recusa(422, "SEM_WHATSAPP", "Este atendimento não tem WhatsApp vinculado.");
  const config = await prisma.whatsappConfig.findUnique({ where: { officeId: a.officeId }, select: { provider: true } });
  if (!config) return recusa(422, "SEM_WHATSAPP", "WhatsApp não configurado para este escritório.");
  const provedor: ProvedorDoWhatsapp = config.provider === "EVOLUTION" ? "EVOLUTION" : "META";

  // 1. O TEMPORÁRIO É DESTA CONVERSA E DESTA CHAVE. Endereço de fora do Blob, de outra conversa ou de outra chave: nada é baixado,
  //    nada é apagado (não é nosso).
  if (!isValidBlobUrl(pedido.blobUrl) || !temporarioEDesta(pedido.blobUrl, a.attendance.id, pedido.clientMessageId)) {
    return recusa(400, "INVALIDO", "Arquivo temporário inválido. Escolha o arquivo e envie de novo.");
  }

  try {
    // 2. BAIXA E CONFERE NO SERVIDOR.
    const baixado = await portas.baixar(pedido.blobUrl, LIMITE_DA_PLATAFORMA_BYTES);
    if (!baixado.ok) {
      return baixado.motivo === "grande"
        ? recusa(413, "GRANDE_DEMAIS", "O arquivo é grande demais para enviar por aqui.")
        : recusa(422, "ARQUIVO_INDISPONIVEL", "Não foi possível ler o arquivo enviado. Tente de novo.");
    }
    const buffer = baixado.buffer;
    const classe = classificarArquivoDeSaida({ name: pedido.nome, size: buffer.length, type: "" }, provedor);
    if (!classe.ok) return recusa(classe.codigo === "GRANDE_DEMAIS" ? 413 : classe.codigo === "VAZIO" ? 422 : 415, classe.codigo === "VAZIO" ? "INVALIDO" : classe.codigo, classe.erro);
    const conteudo = conferirConteudo(buffer, classe.familias);
    if (!conteudo.ok) return recusa(415, "TIPO_NAO_PERMITIDO", conteudo.erro);
    const legenda = validarLegenda(pedido.legenda, classe.tipo);
    if (!legenda.ok) return recusa(400, "INVALIDO", legenda.erro);

    const nome = classe.nome;
    const textoHash = hashDoPedidoDeMidia({ tipo: classe.tipo, nome, legenda: legenda.legenda, buffer });
    const midia: MidiaParaEnviar = { tipo: classe.tipo, mime: classe.mime, buffer, nome, legenda: legenda.legenda };

    // 3. A CHAVE JÁ EXISTE?
    const existente = await prisma.pedidoDeEnvioWhatsapp.findUnique({ where: { officeId_clientMessageId: chave } });
    if (existente && existente.attendanceId !== a.attendance.id) return recusa(409, "CHAVE_REUTILIZADA", "Identificador de mensagem já usado em outra conversa.");
    const decisao = decidirSobreOPedido(existente, { textoHash, agora, confirmouReenvio: pedido.confirmouReenvio });

    switch (decisao.acao) {
      case "chave-reutilizada":
        return recusa(409, "CHAVE_REUTILIZADA", "Este identificador já foi usado com outro arquivo ou outra legenda.");
      case "em-andamento":
        return recusa(409, "EM_ANDAMENTO", FRASE_EM_ANDAMENTO);
      case "sem-confirmacao":
        return recusa(409, "SEM_CONFIRMACAO", FRASE_SEM_CONFIRMACAO);
      case "ja-enviado": {
        // Sai a MESMA mensagem, nenhuma cópia nova. Se a gravação tinha falhado antes, completa agora (o arquivo chegou de novo).
        let mensagem: MensagemDoChat | null = null;
        if (existente!.mensagemId) {
          const m = await prisma.whatsappMessage.findFirst({ where: { id: existente!.mensagemId, officeId: a.officeId }, include: { transcricao: { select: { status: true, texto: true, erro: true } } } });
          mensagem = m ? prepararMensagem(m, agora) : null;
        } else {
          mensagem = await gravarSaida(existente!.id, a, pedido, classe.tipo, nome, legenda.legenda, classe.mime, buffer, existente!.waMessageId, portas);
        }
        return { status: 200, corpo: { ok: true, jaTinhaSaido: true, mensagem } };
      }
      default:
        break;
    }

    // 4. A JANELA DE 24 H (só a Meta tem; a Evolution está sempre aberta).
    const janela = await janelaDaConversa(a.attendance.id, a.officeId, agora);
    if (!janela.aberta) return recusa(409, "FORA_DA_JANELA", "Fora da janela de 24 h: o WhatsApp não deixa enviar arquivo agora.");

    // 5. LIMITE DE ENVIOS POR PESSOA (só para reserva nova; repetir a MESMA chave nunca cai aqui).
    if (!existente) {
      const [noMinuto, naHora] = await Promise.all([
        prisma.pedidoDeEnvioWhatsapp.count({ where: { officeId: a.officeId, userId: a.userId, textoHash: { startsWith: PREFIXO_DO_HASH_DE_MIDIA }, createdAt: { gt: new Date(agora.getTime() - 60_000) } } }),
        prisma.pedidoDeEnvioWhatsapp.count({ where: { officeId: a.officeId, userId: a.userId, textoHash: { startsWith: PREFIXO_DO_HASH_DE_MIDIA }, createdAt: { gt: new Date(agora.getTime() - 3_600_000) } } }),
      ]);
      if (noMinuto >= MAX_MIDIAS_POR_MINUTO || naHora >= MAX_MIDIAS_POR_HORA) {
        return recusa(429, "MUITOS_ENVIOS", "Muitos arquivos enviados em pouco tempo. Espere um instante e tente de novo.");
      }
    }

    // 6. A RESERVA. Quem perde a corrida recebe o estado de quem ganhou.
    let pedidoId: string;
    if (!existente) {
      try {
        const criado = await prisma.pedidoDeEnvioWhatsapp.create({
          data: { ...chave, attendanceId: a.attendance.id, userId: a.userId, clientMessageId: pedido.clientMessageId, textoHash },
          select: { id: true },
        });
        pedidoId = criado.id;
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return recusa(409, "EM_ANDAMENTO", FRASE_EM_ANDAMENTO);
        throw erro;
      }
    } else {
      const tomou = await prisma.pedidoDeEnvioWhatsapp.updateMany({
        where: { id: existente.id, estado: existente.estado, updatedAt: existente.updatedAt },
        data: { estado: "RESERVADO", erro: null, userId: a.userId },
      });
      if (tomou.count === 0) return recusa(409, "EM_ANDAMENTO", FRASE_EM_ANDAMENTO);
      pedidoId = existente.id;
    }

    // 7. O ENVIO. Se o processo cair daqui até o fim, a linha fica RESERVADO: "sem confirmação".
    let resultado: SendResult;
    try {
      resultado = await portas.enviar(a.officeId, a.attendance.waPhone, midia);
    } catch (erro) {
      console.error("[midia-saida] falha inesperada ao chamar o WhatsApp:", mensagemDeErro(erro));
      return recusa(502, "SEM_CONFIRMACAO", FRASE_SEM_CONFIRMACAO);
    }

    if (!resultado.ok && resultado.incerto) {
      await prisma.pedidoDeEnvioWhatsapp.update({ where: { id: pedidoId }, data: { erro: (resultado.error || "sem resposta do WhatsApp").slice(0, 500), updatedAt: new Date(0) } }).catch(() => {});
      return recusa(502, "SEM_CONFIRMACAO", FRASE_SEM_CONFIRMACAO);
    }
    if (!resultado.ok) {
      const erroDoEnvio = resultado.error || "Não foi possível enviar o arquivo.";
      await prisma.pedidoDeEnvioWhatsapp.update({ where: { id: pedidoId }, data: { estado: "FALHOU", erro: erroDoEnvio.slice(0, 500) } }).catch(() => {});
      if (ehErroDeJanela(erroDoEnvio)) return recusa(409, "FORA_DA_JANELA", "Fora da janela de 24 h: o WhatsApp não deixa enviar arquivo agora.");
      return recusa(422, "RECUSADA", erroDoEnvio);
    }

    // 8. SAIU. Primeiro o fato (ENVIADO + id do WhatsApp), depois o resto.
    await prisma.pedidoDeEnvioWhatsapp
      .update({ where: { id: pedidoId }, data: { estado: "ENVIADO", waMessageId: resultado.waMessageId || null, erro: null } })
      .catch((erro) => console.error("[midia-saida] o arquivo saiu, mas o pedido não foi marcado:", mensagemDeErro(erro)));
    const mensagem = await gravarSaida(pedidoId, a, pedido, classe.tipo, nome, legenda.legenda, classe.mime, buffer, resultado.waMessageId || null, portas);
    await silenciarAtendente(a.attendance.id, a.officeId);
    return { status: 200, corpo: { ok: true, jaTinhaSaido: false, mensagem } };
  } finally {
    // 9. O TEMPORÁRIO SAI DO BLOB, dê certo ou não (falha definitiva, sem confirmação, já enviado...). Tentar de novo sobe outro.
    await portas.apagar(pedido.blobUrl).catch(() => {});
  }
}

async function gravarSaida(
  pedidoId: string,
  a: AutorizadoDeMidia,
  pedido: PedidoDeMidia,
  tipo: TipoDeSaida,
  nome: string,
  legenda: string,
  mime: string,
  buffer: Buffer,
  waMessageId: string | null,
  portas: PortasDaMidiaDeSaida,
): Promise<MensagemDoChat | null> {
  try {
    const agora = new Date();
    // A cópia no Drive (o histórico do que o cliente recebeu). Se falhar, a mensagem entra assim mesmo, sem o vínculo.
    const copia = await portas
      .guardarNoDrive({ officeId: a.officeId, userId: a.userId, attendanceId: a.attendance.id, assunto: a.attendance.subject, nomeNoDrive: nomeNoDrive({ clientMessageId: pedido.clientMessageId, nome }, mime, tipo, agora), mime, buffer, tipo, quando: agora })
      .catch(() => null);
    const mensagem = await registrarMensagem(
      {
        attendanceId: a.attendance.id,
        officeId: a.officeId,
        direction: "OUT",
        body: rotuloDaMidiaWhatsapp(TIPO_DO_DRIVE[tipo], legenda, nome),
        waMessageId: waMessageId || null,
        status: "SENT",
        fromNumber: a.attendance.waPhone,
        clientMessageId: pedido.clientMessageId,
        ...(copia ? { attachmentId: copia.attachmentId, midiaMime: mime.slice(0, 120), midiaBytes: buffer.length } : {}),
      },
      { waLastMessageAt: agora, firstResponseAt: a.attendance.firstResponseAt ?? agora },
    );
    await prisma.pedidoDeEnvioWhatsapp.update({ where: { id: pedidoId }, data: { mensagemId: mensagem.id } });
    return prepararMensagem(mensagem, new Date());
  } catch (erro) {
    // O arquivo JÁ SAIU para o cliente. Falhar aqui não pode virar "não enviado" na tela; o pedido fica ENVIADO sem `mensagemId`
    // e uma nova tentativa com a mesma chave só completa a gravação.
    console.error("[midia-saida] o arquivo saiu, mas a gravação falhou:", mensagemDeErro(erro));
    return null;
  }
}
