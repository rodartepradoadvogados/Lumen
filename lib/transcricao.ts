// ============================================================================
// TRANSCRIÇÃO DE ÁUDIO DO WHATSAPP — O LADO DE IO.
//
// A parte pura (decidir se está configurado, montar/interpretar a resposta, o rótulo que vai ao
// agente e à tela) mora em lib/transcricaoDeAudio.ts. Este arquivo faz só duas coisas que não cabem
// num teste de mesa: falar com o serviço de transcrição pela rede, e gravar o resultado no banco.
//
// Chamado por lib/whatsapp.ts (ingestIncomingWhatsapp), NUNCA o contrário — ver o comentário lá
// sobre por que a chamada de download do áudio mora em lib/whatsapp.ts, e não aqui: evita um
// import circular (lib/whatsapp.ts → lib/transcricao.ts → lib/whatsapp.ts) e mantém este arquivo
// sem saber nada sobre Meta/Evolution/mediaId — ele só recebe um Buffer já baixado.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import {
  lerConfigDeTranscricao,
  lerRespostaDeTranscricao,
  ERRO_TRANSCRICAO_NAO_CONFIGURADA,
  type ConfigDeTranscricao,
} from "@/lib/transcricaoDeAudio";

// Um áudio de voz do WhatsApp não passa de poucos minutos (o próprio app limita a gravação); 60s de
// folga para o upload + a transcrição de verdade é generoso sem travar o webhook indefinidamente se
// o serviço configurado ficar mudo. Bem mais curto que o teto do Hermes (ver lib/hermesPonte.ts) —
// que é a chamada mais lenta desta corrente, e é onde o corte deve doer primeiro.
const ESPERA_MS = 60_000;

function configDoAmbiente(): ConfigDeTranscricao | null {
  return lerConfigDeTranscricao({
    url: process.env.TRANSCRICAO_URL,
    token: process.env.TRANSCRICAO_TOKEN,
    modelo: process.env.TRANSCRICAO_MODELO,
  });
}

/** true só quando as duas variáveis obrigatórias estão presentes — ver lerConfigDeTranscricao (fail-closed). */
export function transcricaoConfigurada(): boolean {
  return configDoAmbiente() !== null;
}

/**
 * Fala o protocolo OpenAI-compatível de transcrição: `POST {base}/v1/audio/transcriptions`,
 * `multipart/form-data` com os campos `file` e `model`, `Authorization: Bearer <token>`. A MESMA
 * chamada atende Whisper auto-hospedado, Groq ou OpenAI — só a config muda. Sem SDK de fornecedor:
 * `fetch`/`FormData`/`Blob` são globais do runtime Node usado pela Vercel, e bastam.
 *
 * Exportada (só por isto) para lib/testes/transcricaoDeAudio.teste.ts conseguir verificar a
 * chamada de verdade contra um servidor de mentira local que fala o mesmo protocolo — não há como
 * testar a chamada de rede de outro jeito sem um serviço de transcrição real (que este ambiente
 * não tem). Nenhum outro arquivo de produção deve importar esta função: quem quer transcrever um
 * áudio usa `transcreverAudioRecebido`, que também grava o resultado.
 */
export async function chamarServicoDeTranscricao(
  config: ConfigDeTranscricao,
  audio: { buffer: Buffer; mimeType: string; nomeArquivo: string },
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const forma = new FormData();
  forma.append("model", config.modelo);
  forma.append("file", new Blob([new Uint8Array(audio.buffer)], { type: audio.mimeType }), audio.nomeArquivo);

  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), ESPERA_MS);
  try {
    const resposta = await fetch(`${config.url}/v1/audio/transcriptions`, {
      method: "POST",
      // SÓ O AUTHORIZATION VIAJA COM O TOKEN, e só nesta chamada — ele nunca entra na URL (que
      // pode acabar em log de acesso de um proxy no meio do caminho) nem no corpo.
      headers: { Authorization: `Bearer ${config.token}` },
      body: forma,
      signal: controlador.signal,
    });

    let corpo: unknown = null;
    try {
      corpo = await resposta.json();
    } catch {
      // resposta sem corpo JSON (ou corpo que não é JSON) — lerRespostaDeTranscricao decide pelo
      // status HTTP sozinho, e o corpo (que pode ser HTML de erro de um proxy, por exemplo) nunca
      // chega a ser lido como texto nem guardado em lugar nenhum.
    }
    return lerRespostaDeTranscricao(resposta.status, corpo);
  } catch (erro) {
    // mensagemDeErro nunca inclui o token: ele não faz parte da mensagem de erro do `fetch` (só do
    // cabeçalho da requisição, que o runtime não ecoa de volta em exceção de rede).
    const motivo =
      erro instanceof Error && erro.name === "AbortError"
        ? "o serviço de transcrição não respondeu a tempo"
        : mensagemDeErro(erro);
    return { ok: false, erro: motivo };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Transcreve UM áudio já baixado e guarda o resultado como um TranscricaoDeAudio — um REGISTRO
 * PRÓPRIO, nunca uma WhatsappMessage (ver o comentário do modelo em prisma/schema.prisma: é a
 * decisão de projeto central desta entrega, e não está em aberto).
 *
 * FAIL-CLOSED: sem TRANSCRICAO_URL e TRANSCRICAO_TOKEN configurados, esta função NUNCA chama a
 * rede — grava direto um FALHOU com o motivo fixo ERRO_TRANSCRICAO_NAO_CONFIGURADA. O áudio já
 * subiu (ou vai subir) pro Drive por outro caminho (lib/whatsapp.ts:processarMidiaRecebida); só a
 * transcrição fica de fora.
 *
 * Nunca lança — mesmo padrão do resto da integração de WhatsApp (lib/whatsapp.ts): quem chama já
 * registrou a mensagem de áudio antes de chegar aqui, e uma falha nesta função vira um
 * TranscricaoDeAudio com status FALHOU, nunca uma exceção que devolve a Promise rejeitada acima —
 * exceto se o PRÓPRIO banco falhar no upsert, e por isso quem chama ainda encapsula com `.catch()`.
 */
export async function transcreverAudioRecebido(
  officeId: string,
  whatsappMessageId: string,
  audio: { buffer: Buffer; mimeType: string; nomeArquivo: string },
): Promise<void> {
  const config = configDoAmbiente();
  if (!config) {
    await prisma.transcricaoDeAudio.upsert({
      where: { whatsappMessageId },
      create: { whatsappMessageId, officeId, status: "FALHOU", erro: ERRO_TRANSCRICAO_NAO_CONFIGURADA, concluidoEm: new Date() },
      update: { status: "FALHOU", texto: null, erro: ERRO_TRANSCRICAO_NAO_CONFIGURADA, concluidoEm: new Date() },
    });
    return;
  }

  // PENDENTE é gravado ANTES da chamada de rede — mesmo numa transcrição síncrona (que roda antes
  // de a Ana responder, ver a nota em lib/whatsapp.ts), é este registro que garante que a tela
  // sempre tem uma linha para mostrar, mesmo que o processo caia no meio (a chamada HTTP trava sem
  // nunca resolver e a função nunca chega a atualizar para PRONTA/FALHOU) — melhor mostrar
  // "transcrevendo…" para sempre do que a bolha do áudio nunca ter nada.
  await prisma.transcricaoDeAudio.upsert({
    where: { whatsappMessageId },
    create: { whatsappMessageId, officeId, status: "PENDENTE" },
    update: { status: "PENDENTE", texto: null, erro: null, concluidoEm: null },
  });

  const resultado = await chamarServicoDeTranscricao(config, audio);

  if (resultado.ok) {
    await prisma.transcricaoDeAudio.update({
      where: { whatsappMessageId },
      data: { status: "PRONTA", texto: resultado.texto, erro: null, concluidoEm: new Date() },
    });
  } else {
    await prisma.transcricaoDeAudio.update({
      where: { whatsappMessageId },
      data: { status: "FALHOU", texto: null, erro: resultado.erro, concluidoEm: new Date() },
    });
  }
}
