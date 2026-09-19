import { NextRequest } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { ingestIncomingWhatsapp } from "@/lib/whatsapp";
import { parseEntradaEvolution } from "@/lib/whatsappEvolution";
import { atendenteResponde } from "@/lib/atendenteResponde";

export const dynamic = "force-dynamic";
// O agente pode levar dezenas de segundos, e a resposta sai dentro deste mesmo pedido.
export const maxDuration = 120;

// ============================================================================
// A PORTA DE ENTRADA DA EVOLUTION.
//
// Separada da rota da Meta de propósito. A da Meta valida assinatura HMAC do corpo com um segredo
// global de plataforma; esta valida um segredo POR ESCRITÓRIO, que a própria instância devolve no
// cabeçalho porque foi assim que ela foi criada (ver criarInstancia). Misturar as duas numa rota
// só faria a validação virar uma cadeia de "se for isso, senão aquilo" — e é justamente numa
// cadeia dessas que um dia alguém acrescenta um caminho que não valida nada.
//
// FECHADA POR PADRÃO, como a outra: sem segredo cadastrado no escritório, recusa. Uma porta de
// entrada sem prova de origem é um jeito de estranho injetar lead falso no CRM de um escritório
// — e, com o agente ligado, de fazer o escritório RESPONDER a esse lead falso.
// ============================================================================

export async function POST(req: NextRequest) {
  const segredoRecebido = req.headers.get("x-lumen-evolution") || "";
  if (!segredoRecebido) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bruto = await req.text();

  let entrada: ReturnType<typeof parseEntradaEvolution> = null;
  try {
    entrada = parseEntradaEvolution(JSON.parse(bruto));
  } catch {
    // Corpo ilegível: nada a processar. Ack para a Evolution não reenviar em laço.
    return Response.json({ received: true }, { status: 200 });
  }

  // Sem mensagem de texto de terceiro (status, mídia, grupo, mensagem do próprio escritório):
  // ack e pronto. Isto vem ANTES de qualquer consulta ao banco: a maior parte do tráfego de um
  // webhook do WhatsApp é isto, e não vale uma ida ao banco por evento descartado.
  if (!entrada) {
    return Response.json({ received: true }, { status: 200 });
  }

  const config = await prisma.whatsappConfig.findUnique({
    where: { phoneNumberId: entrada.phoneNumberId },
    select: { webhookSecret: true, provider: true },
  });

  // Instância desconhecida, provedor errado ou segredo não cadastrado → recusa. A mesma resposta
  // para os três casos: quem está do outro lado não precisa saber qual deles foi.
  if (!config || config.provider !== "EVOLUTION" || !config.webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const a = Buffer.from(segredoRecebido);
  const b = Buffer.from(config.webhookSecret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const attendanceId = await ingestIncomingWhatsapp(entrada);
    // O atendente responde DENTRO deste pedido, e não depois: a Evolution não reenvia por
    // demora, e uma resposta que sai dois minutos atrasada, para um cliente esperando no
    // WhatsApp, já não é resposta. Ele nunca lança — falha vira motivo registrado, e a mensagem
    // fica lá esperando uma pessoa.
    if (attendanceId) await atendenteResponde(attendanceId);
  } catch (e) {
    // NUNCA devolver erro: a Evolution reenviaria em laço. Registra e confirma o recebimento.
    console.error("[whatsapp evolution] erro ao processar mensagem:", e);
  }

  return Response.json({ received: true }, { status: 200 });
}
