// ============================================================================
// A TRANSCRIÇÃO DE ÁUDIO, FORA DO PEDIDO DO WEBHOOK.
//
// ACHADO NA REVISÃO: rodar a transcrição E o Hermes dentro do mesmo pedido que recebe o webhook
// não fecha a conta — os dois juntos podem passar do `maxDuration` da rota, e a plataforma mata a
// função ANTES de o Hermes responder. O cliente fica SEM RESPOSTA NENHUMA, pior que o problema
// que esta entrega resolve. A decisão do dono foi tirar a transcrição do webhook por completo:
//
//   1. O webhook recebe o áudio, sobe pro Drive (rápido) e cria o registro PENDENTE — tudo isso já
//      existia. Manda uma confirmação FIXA (lib/confirmacaoDeAudio.ts, não passa pelo Hermes) e
//      DISPARA este processamento sem esperar (dispararTranscricaoAssincrona).
//   2. Este arquivo baixa o áudio DO DRIVE (não da Meta/Evolution de novo — a URL delas já
//      expirou), transcreve, e chama atendenteResponde NOVAMENTE — que reavalia tudo do zero
//      (silêncio, módulo, chave da conversa, se a última mensagem ainda é do cliente) antes de
//      mandar a resposta de verdade como uma SEGUNDA mensagem.
//   3. Uma rede de segurança por cron (app/api/cron/transcricoes-pendentes) varre o que ficou
//      PENDENTE além de alguns minutos — o disparo imediato é "melhor esforço": em serverless a
//      função pode congelar antes do fetch completar, e sem a varredura um áudio ficaria
//      silenciosamente sem resposta pra sempre.
//
// A REAVALIAÇÃO (passo 2) NÃO É CÓDIGO NOVO — é a MESMA função de sempre (atendenteResponde),
// chamada de novo. Ela já confere deveResponder (silêncio, módulo, chave da conversa, número
// autorizado) e se a ÚLTIMA mensagem ainda é do cliente — se um humano respondeu enquanto a
// transcrição rodava, a última mensagem passa a ser dele (OUT) e atendenteResponde não manda
// nada. Reaproveitar em vez de duplicar essa lógica é o que garante que a segunda mensagem nunca
// atropela um humano: a trava é a mesma, testada, de sempre.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { downloadDriveFile, type StorageProvider } from "@/lib/storageProvider";
import { extensaoDoArquivo } from "@/lib/driveNaming";
import { transcreverAudioRecebido } from "@/lib/transcricao";
import { ERRO_ARQUIVO_INDISPONIVEL } from "@/lib/transcricaoDeAudio";
import { atendenteResponde } from "@/lib/atendenteResponde";
import { orcamentoParaHermes } from "@/lib/orcamentoDoPedido";
import { getAppUrl } from "@/lib/appUrl";

/**
 * Dispara o processamento sem esperar a conclusão — só inicia o pedido HTTP e segue. É
 * "melhor esforço" DE PROPÓSITO: esperar aqui devolveria o problema que esta entrega resolve
 * (o pedido do webhook ficando preso na transcrição+Hermes). A confiabilidade vem da rede de
 * segurança por cron (varrerTranscricoesPendentes), não deste disparo.
 *
 * FAIL-CLOSED: sem TRANSCRICAO_INTERNA_SECRET configurado, nem tenta — a rota interna recusaria a
 * chamada de qualquer jeito (ver app/api/transcricao/processar/route.ts), e um pedido fadado a
 * 401 não vale o log de erro que geraria.
 */
export function dispararTranscricaoAssincrona(waMessageId: string): void {
  const segredo = process.env.TRANSCRICAO_INTERNA_SECRET;
  if (!segredo) return;

  fetch(`${getAppUrl()}/api/transcricao/processar`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${segredo}` },
    body: JSON.stringify({ waMessageId }),
  }).catch((e) => {
    // Best-effort: o cron pega este item na próxima varredura, mesmo que este disparo se perca.
    console.error(`[transcricaoAssincrona] falha ao disparar o processamento da mensagem ${waMessageId} (a rede de segurança do cron ainda vai pegar):`, e);
  });
}

/**
 * O trabalho de verdade: baixa o áudio do Drive, transcreve, e deixa a Ana responder de novo.
 *
 * Chamada tanto pelo disparo imediato (app/api/transcricao/processar/route.ts) quanto pelo cron
 * de segurança (varrerTranscricoesPendentes, abaixo) — o MESMO caminho para os dois, então uma
 * chamada duplicada (o disparo imediato E o cron pegando o mesmo item) é inofensiva: a checagem de
 * status abaixo faz a segunda chamada não fazer nada.
 *
 * Nunca lança.
 */
export async function processarTranscricaoAssincrona(waMessageId: string): Promise<void> {
  const inicio = Date.now();
  try {
    const mensagem = await prisma.whatsappMessage.findUnique({
      where: { waMessageId },
      select: {
        id: true,
        attendanceId: true,
        officeId: true,
        transcricao: { select: { status: true, storageProvider: true, storageFileId: true } },
      },
    });
    // Mensagem desconhecida, ou não é (ou não era) um áudio — nada a transcrever.
    if (!mensagem || !mensagem.transcricao) return;
    // IDEMPOTÊNCIA: já foi processada (o disparo imediato e o cron podem pegar o mesmo item; ou
    // este processamento já rodou antes). Só o PRIMEIRO a chegar aqui faz alguma coisa.
    if (mensagem.transcricao.status !== "PENDENTE") return;

    const { storageProvider, storageFileId } = mensagem.transcricao;
    if (!storageProvider || !storageFileId) {
      // Sem cópia durável (o upload pro Drive falhou lá no webhook) — não há de onde ler o áudio.
      await prisma.transcricaoDeAudio.update({
        where: { whatsappMessageId: mensagem.id },
        data: { status: "FALHOU", erro: ERRO_ARQUIVO_INDISPONIVEL, concluidoEm: new Date() },
      });
    } else {
      try {
        const arquivo = await downloadDriveFile(storageFileId, mensagem.officeId, storageProvider as StorageProvider);
        await transcreverAudioRecebido(mensagem.officeId, mensagem.id, {
          buffer: arquivo.content,
          mimeType: arquivo.mimeType,
          nomeArquivo: `audio.${extensaoDoArquivo(arquivo.mimeType)}`,
        });
      } catch (e) {
        await prisma.transcricaoDeAudio.update({
          where: { whatsappMessageId: mensagem.id },
          data: { status: "FALHOU", erro: mensagemDeErro(e), concluidoEm: new Date() },
        });
      }
    }

    // A ANA RESPONDE DE NOVO — reavaliando tudo do zero. Ver a nota extensa no topo do arquivo:
    // isto NÃO é uma trava nova, é a MESMA atendenteResponde de sempre, chamada de novo agora que
    // a transcrição (pronta ou não) está disponível. O orçamento aqui é o desta rota (própria
    // `maxDuration`, não o do webhook original, que já terminou há muito).
    const orcamentoRestanteMs = orcamentoParaHermes(Date.now() - inicio);
    await atendenteResponde(mensagem.attendanceId, { orcamentoRestanteMs });
  } catch (erro) {
    console.error(`[transcricaoAssincrona] falha inesperada ao processar ${waMessageId}:`, mensagemDeErro(erro));
  }
}

// Tempo generoso pro disparo imediato (dispararTranscricaoAssincrona) terminar sozinho ANTES de o
// cron pegar o mesmo item — sem esta folga, o cron reprocessaria (de forma inofensiva, graças à
// idempotência acima, mas desperdiçando trabalho) praticamente toda transcrição.
const GRACA_ANTES_DO_CRON_MS = 3 * 60_000;

/**
 * A REDE DE SEGURANÇA (app/api/cron/transcricoes-pendentes). Varre o que ficou PENDENTE além da
 * folga acima e processa de novo — cada item no seu próprio try/catch (processarTranscricaoAssincrona
 * já nunca lança, mas a dupla proteção custa três linhas e evita que um erro de infraestrutura no
 * meio do laço engula os itens seguintes).
 */
export async function varrerTranscricoesPendentes(): Promise<{ processadas: number; falharam: number }> {
  const limite = new Date(Date.now() - GRACA_ANTES_DO_CRON_MS);
  const pendentes = await prisma.transcricaoDeAudio.findMany({
    where: { status: "PENDENTE", criadoEm: { lt: limite } },
    select: { whatsappMessage: { select: { waMessageId: true } } },
  });

  let falharam = 0;
  for (const item of pendentes) {
    const waMessageId = item.whatsappMessage?.waMessageId;
    if (!waMessageId) continue;
    try {
      await processarTranscricaoAssincrona(waMessageId);
    } catch (e) {
      falharam++;
      console.error("[transcricoes-pendentes] falha ao processar item da varredura:", mensagemDeErro(e));
    }
  }
  return { processadas: pendentes.length - falharam, falharam };
}
