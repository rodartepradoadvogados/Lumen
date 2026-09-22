import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { atendenteResponde } from "@/lib/atendenteResponde";
import { ROTULO_FIGURINHA } from "@/lib/whatsapp";
import { getAppUrl } from "@/lib/appUrl";

// ============================================================================
// A FIGURINHA QUE A ANA NÃO VÊ — MAS AVISA.
//
// O PEDIDO DO DONO: quando chega SÓ uma figurinha (nada de texto, nenhuma outra mídia junto), a
// Ana espera 15 segundos e, se nada mais chegar nesse meio-tempo, diz que não conseguiu
// identificar aquele tipo de mensagem e pede para a pessoa escrever. Uma vez só por leva de
// figurinhas, não uma vez por figurinha.
//
// MESMO DESENHO DA TRANSCRIÇÃO ASSÍNCRONA (lib/transcricaoAssincrona.ts), pelo mesmo motivo: este
// ambiente é serverless, e "esperar 15 segundos segurando o webhook" prenderia a função da Meta/
// Evolution por um tempo que não é dela — o cliente que manda uma figurinha e SEGUE ESCREVENDO
// normalmente já teria a mensagem de texto respondida bem antes de o webhook devolver. O desenho
// é: o webhook grava a figurinha e DISPARA este processamento sem esperar
// (dispararAvisoFigurinha); quem de fato espera os 15 segundos é uma ROTA PRÓPRIA
// (app/api/whatsapp/aviso-figurinha/processar), fora do pedido do webhook; e uma rede de
// segurança por CRON (app/api/cron/avisos-de-figurinha) pega o que esse disparo perder pelo
// caminho — o mesmo "melhor esforço + rede de segurança" de sempre.
//
// O NÚMERO REAL DE 15 SEGUNDOS SÓ VALE NO CAMINHO FELIZ (o disparo imediato completando). Se ele
// falhar (a função que recebeu o webhook morrer antes do `fetch` sair, a rota interna cair), quem
// avisa é o cron, e aí o atraso é o da folga abaixo (GRACA_ANTES_DO_CRON_MS) somado ao próximo
// disparo do cron (até 5 minutos, ver vercel.json) — na PRÁTICA, até uns 8 minutos no pior caso.
// Ver o relatório da entrega para os números medidos.
//
// A RESPOSTA É A MESMA ANA DE SEMPRE. `processarAvisoFigurinha` não manda mensagem nenhuma
// diretamente — ele só confere se o aviso ainda faz sentido e chama `atendenteResponde` de novo,
// exatamente como a transcrição faz depois de baixar o áudio: a MESMA função, reavaliando tudo do
// zero (módulo, silêncio, chave da conversa, se a última mensagem ainda é do cliente). É isso que
// garante que o aviso nunca atropela um humano que assumiu a conversa nesse meio-tempo, e que ele
// passa pelas MESMAS travas (limites duros, orçamento do prompt) que qualquer resposta da Ana —
// nada de um caminho de envio paralelo.
// ============================================================================

/**
 * A janela de espera de verdade, no caminho feliz (disparo imediato completando sozinho). Pedido
 * do dono, ao pé da letra: "após 15 segundos de mensagem só com figurinha". Exportada para
 * app/api/whatsapp/aviso-figurinha/processar/route.ts usar a MESMA constante — subir um número
 * sem subir o outro não pode ser possível por um `import` esquecido.
 */
export const ESPERA_ANTES_DE_AVISAR_MS = 15_000;

// Folga antes de o CRON reconsiderar um item: dá tempo do disparo imediato terminar sozinho — os
// 15 segundos de espera MAIS até ESPERA_PADRAO_DO_HERMES_MS (105s, lib/hermesPonte.ts) que
// atendenteResponde pode levar para compor a resposta — antes de competir com ele. Mesma ordem de
// grandeza da folga da transcrição (lib/transcricaoAssincrona.ts), pelo mesmo motivo: sem essa
// folga o cron reprocessaria (de forma seguindo o próprio mecanismo de reivindicação abaixo, mas
// desperdiçando trabalho) praticamente todo aviso ainda em andamento.
const GRACA_ANTES_DO_CRON_MS = 3 * 60_000;

// A varredura do cron só olha para trás até aqui. Sem um teto, cada figurinha respondida (ou
// superada) continuaria para sempre na lista de candidatas — `status` já deixou de ser
// "RECEIVED" para ela (ver a reivindicação abaixo), então o filtro por status já resolveria isso
// sozinho, mas um teto de tempo é uma segunda rede de segurança barata contra qualquer figurinha
// que, por algum defeito, nunca seja reivindicada por ninguém: depois de uma hora sem resposta,
// não é mais "processamento atrasado", é outra coisa — e vale ficar plantada, visível, em vez de
// a varredura tentar de novo a cada 5 minutos para sempre.
const JANELA_DE_BUSCA_DO_CRON_MS = 60 * 60_000;

// Os DOIS status que uma figurinha "resolvida" pode assumir — nunca mais "RECEIVED" depois disso.
// Ver a nota sobre por que `status` (campo texto livre, não um enum do Prisma) é seguro de
// reaproveitar aqui: nenhuma tela nem consulta filtra WhatsappMessage.IN por status, e os dois
// valores abaixo funcionam exatamente como o `avisoAutomaticoEm` de lib/avisoDeLead.ts — uma
// RECLAMAÇÃO ATÔMICA (`updateMany` com o valor antigo no `where`) que garante que só QUEM
// CONSEGUIU MUDAR o status é quem decide o que fazer a seguir. Sem isto, o disparo imediato e o
// cron pegando a MESMA figurinha ao mesmo tempo mandariam o aviso em dobro para o cliente.
const STATUS_FIGURINHA_AVISADA = "FIGURINHA_AVISADA";
const STATUS_FIGURINHA_SUPERADA = "FIGURINHA_SUPERADA";

/**
 * Dispara o processamento sem esperar a conclusão — só inicia o pedido HTTP e segue. "Melhor
 * esforço" DE PROPÓSITO, mesmo motivo de dispararTranscricaoAssincrona: esperar aqui devolveria o
 * problema que esta entrega resolve (o webhook preso 15 segundos por uma figurinha).
 *
 * FAIL-CLOSED: sem AVISO_FIGURINHA_INTERNA_SECRET configurado, nem tenta — a rota interna
 * recusaria a chamada de qualquer jeito, e um pedido fadado a 401 não vale o log de erro que
 * geraria. Sem o disparo imediato, o aviso ainda sai — só que só pela mão do cron, mais devagar
 * (ver a nota no topo do arquivo).
 */
export function dispararAvisoFigurinha(waMessageId: string): void {
  const segredo = process.env.AVISO_FIGURINHA_INTERNA_SECRET;
  if (!segredo) return;

  fetch(`${getAppUrl()}/api/whatsapp/aviso-figurinha/processar`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${segredo}` },
    body: JSON.stringify({ waMessageId }),
  }).catch((e) => {
    // Best-effort: o cron pega este item na próxima varredura, mesmo que este disparo se perca.
    console.error(`[avisoFigurinha] falha ao disparar o aviso da mensagem ${waMessageId} (a rede de segurança do cron ainda vai pegar):`, e);
  });
}

/**
 * O trabalho de verdade: espera (se for o caso), confere se o aviso ainda faz sentido, reivindica
 * a mensagem para nunca reconsiderá-la de novo, e — só se ainda fizer sentido — deixa a Ana
 * responder.
 *
 * `opcoes.esperarMs` é passado SÓ pelo disparo imediato (a espera de 15 segundos de verdade); o
 * cron chama sem isso, porque quando ele pega o item a folga (GRACA_ANTES_DO_CRON_MS) já cumpriu
 * o papel da espera.
 *
 * Nunca lança.
 */
export async function processarAvisoFigurinha(waMessageId: string, opcoes: { esperarMs?: number } = {}): Promise<void> {
  try {
    if (opcoes.esperarMs) {
      await new Promise((resolve) => setTimeout(resolve, opcoes.esperarMs));
    }

    const mensagem = await prisma.whatsappMessage.findUnique({
      where: { waMessageId },
      select: { id: true, attendanceId: true, direction: true, body: true, status: true },
    });
    // Mensagem desconhecida, não é (mais) uma figurinha solitária, ou já foi reivindicada por
    // outra chamada (disparo imediato e cron podem pegar o mesmo item) — nada a fazer.
    if (!mensagem || mensagem.direction !== "IN" || mensagem.body !== ROTULO_FIGURINHA) return;
    if (mensagem.status !== "RECEIVED") return;

    // AINDA É A ÚLTIMA MENSAGEM DA CONVERSA? Se alguma coisa mais nova chegou — outra figurinha,
    // uma mensagem de verdade do cliente, ou até uma resposta que já saiu por outro caminho — o
    // aviso perdeu a razão de existir: "se qualquer mensagem de verdade chegar dentro desses 15
    // segundos, o aviso não sai" (pedido do dono), e uma figurinha mais nova na mesma leva não
    // deve gerar um segundo aviso (só a ÚLTIMA da leva chega até aqui com esta condição verdadeira
    // — todas as anteriores encontram, na hora em que a delas chegaria, algo mais novo já gravado).
    const maisRecente = await prisma.whatsappMessage.findFirst({
      where: { attendanceId: mensagem.attendanceId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const aindaEhAUltima = maisRecente?.id === mensagem.id;

    // A RECLAMAÇÃO. Vem ANTES de chamar atendenteResponde, nunca depois — atendenteResponde tem
    // efeito colateral (manda mensagem de verdade), e reivindicar só depois de mandar deixaria a
    // janela de corrida aberta bem no momento em que ela mais importa.
    const reivindicou = await prisma.whatsappMessage.updateMany({
      where: { id: mensagem.id, status: "RECEIVED" },
      data: { status: aindaEhAUltima ? STATUS_FIGURINHA_AVISADA : STATUS_FIGURINHA_SUPERADA },
    });
    if (reivindicou.count === 0) return; // outra chamada chegou primeiro (disparo × cron)

    if (aindaEhAUltima) {
      // A REAVALIAÇÃO É A MESMA atendenteResponde DE SEMPRE — não um atalho que ignora
      // deveResponder. Se um humano assumiu a conversa nesse meio-tempo, ou o módulo foi
      // desligado, ou o número saiu da lista, ela decide isso sozinha, como sempre decidiu.
      await atendenteResponde(mensagem.attendanceId);
    }
  } catch (erro) {
    console.error(`[avisoFigurinha] falha inesperada ao processar ${waMessageId}:`, mensagemDeErro(erro));
  }
}

/**
 * A REDE DE SEGURANÇA (app/api/cron/avisos-de-figurinha). Varre o que ainda está "RECEIVED" além
 * da folga acima e processa de novo — cada item no seu próprio try/catch (processarAvisoFigurinha
 * já nunca lança, mas a dupla proteção custa três linhas e evita que um erro de infraestrutura no
 * meio do laço engula os itens seguintes).
 */
export async function varrerAvisosFigurinhaPendentes(): Promise<{ processadas: number; falharam: number }> {
  const agora = Date.now();
  const limite = new Date(agora - GRACA_ANTES_DO_CRON_MS);
  const janela = new Date(agora - JANELA_DE_BUSCA_DO_CRON_MS);

  const pendentes = await prisma.whatsappMessage.findMany({
    where: {
      direction: "IN",
      body: ROTULO_FIGURINHA,
      status: "RECEIVED",
      createdAt: { lt: limite, gt: janela },
    },
    select: { waMessageId: true },
  });

  let falharam = 0;
  for (const item of pendentes) {
    const waMessageId = item.waMessageId;
    if (!waMessageId) continue;
    try {
      await processarAvisoFigurinha(waMessageId);
    } catch (e) {
      falharam++;
      console.error("[avisos-figurinha] falha ao processar item da varredura:", mensagemDeErro(e));
    }
  }
  return { processadas: pendentes.length - falharam, falharam };
}
