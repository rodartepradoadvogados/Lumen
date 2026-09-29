import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registrarMensagem } from "@/lib/registrarMensagem";
import { sendWhatsappText, type SendResult } from "@/lib/whatsapp";
import { silenciarAtendente } from "@/lib/atendenteResponde";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { prepararMensagem, type MensagemDoChat } from "@/lib/mensagensDoChat";
import { janelaDoWhatsapp, ehErroDeJanela, type JanelaDoWhatsapp } from "@/lib/janelaDe24h";
import { decidirSobreOPedido, type CodigoDeEnvio } from "@/lib/envioDeMensagem";
import { hashDoTexto } from "@/lib/hashDoTexto";

// ============================================================================
// O LADO DE BANCO DO ENVIO DE TEXTO PELO APLICATIVO.
//
// ATENÇÃO: esta função NÃO confere o dono da conversa — quem a chama já passou por `atendimentoDaRota`
// (lib/guardaDoAtendimento.ts: 401 / 403 / 404) e entrega aqui o atendimento JÁ AUTORIZADO. O
// `officeId` do viewer entra em todas as consultas como segundo cinto.
//
// A ORDEM É O QUE PROTEGE O CLIENTE:
//   1. a chave já existe? -> decide (já saiu / falhou / em curso / sem confirmação)
//   2. a janela de 24 h está aberta? -> senão, recusa SEM reservar nada
//   3. RESERVA a chave (linha única) -> só quem reservou chama o WhatsApp
//   4. envia
//   5. ENVIADO + registrarMensagem (a única porta de escrita de mensagem) + a pessoa assume a conversa
//      (a Ana só é silenciada quando o envio DÁ CERTO: falha não assume)
//
// `enviar` é a costura de teste (o padrão é o envio de verdade): quem testa passa o seu, o código de
// produção nunca passa nada.
// ============================================================================

export type RespostaDoEnvio =
  | { status: 200; corpo: { ok: true; jaTinhaSaido: boolean; mensagem: MensagemDoChat | null } }
  | { status: number; corpo: { ok: false; codigo: CodigoDeEnvio; erro: string } };

type Autorizado = {
  officeId: string;
  userId: string;
  attendance: { id: string; waPhone: string | null; firstResponseAt: Date | null };
};

function recusa(status: number, codigo: CodigoDeEnvio, erro: string): RespostaDoEnvio {
  return { status, corpo: { ok: false, codigo, erro } };
}

/** A janela desta conversa agora: última mensagem do CLIENTE + o provedor do escritório. */
export async function janelaDaConversa(attendanceId: string, officeId: string, agora: Date): Promise<JanelaDoWhatsapp> {
  const [config, ultimaEntrada] = await Promise.all([
    prisma.whatsappConfig.findUnique({ where: { officeId }, select: { provider: true } }),
    prisma.whatsappMessage.findFirst({
      where: { attendanceId, officeId, direction: "IN" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return janelaDoWhatsapp(config?.provider, ultimaEntrada?.createdAt, agora);
}

async function gravarEntrega(pedidoId: string, a: Autorizado, clientMessageId: string, texto: string, waMessageId: string | null): Promise<MensagemDoChat | null> {
  try {
    const agora = new Date();
    const mensagem = await registrarMensagem(
      {
        attendanceId: a.attendance.id,
        officeId: a.officeId,
        direction: "OUT",
        body: texto,
        waMessageId: waMessageId || null,
        status: "SENT",
        fromNumber: a.attendance.waPhone,
        clientMessageId,
      },
      { waLastMessageAt: agora, firstResponseAt: a.attendance.firstResponseAt ?? agora },
    );
    await prisma.pedidoDeEnvioWhatsapp.update({ where: { id: pedidoId }, data: { mensagemId: mensagem.id } });
    return prepararMensagem(mensagem, new Date());
  } catch (erro) {
    // A mensagem JÁ SAIU para o cliente. Falhar aqui não pode virar "não enviada" na tela; o pedido
    // fica ENVIADO sem `mensagemId` e uma nova tentativa com a mesma chave só completa a gravação.
    console.error("[envio] a mensagem saiu, mas a gravação falhou:", mensagemDeErro(erro));
    return null;
  }
}

export async function enviarMensagemDoApp(
  a: Autorizado,
  pedido: { clientMessageId: string; texto: string; confirmouReenvio: boolean },
  opcoes: { agora?: Date; enviar?: (officeId: string, para: string, texto: string) => Promise<SendResult> } = {},
): Promise<RespostaDoEnvio> {
  const agora = opcoes.agora ?? new Date();
  const enviar = opcoes.enviar ?? sendWhatsappText;
  const textoHash = hashDoTexto(pedido.texto);
  const chave = { officeId: a.officeId, clientMessageId: pedido.clientMessageId };

  if (!a.attendance.waPhone) return recusa(422, "SEM_WHATSAPP", "Este atendimento não tem WhatsApp vinculado.");

  // 1. A CHAVE JÁ EXISTE?
  const existente = await prisma.pedidoDeEnvioWhatsapp.findUnique({ where: { officeId_clientMessageId: chave } });
  // A chave é do aparelho, mas o pedido é desta conversa: a mesma chave em OUTRA conversa não "reenvia".
  if (existente && existente.attendanceId !== a.attendance.id) return recusa(409, "CHAVE_REUTILIZADA", "Identificador de mensagem já usado em outra conversa.");
  const decisao = decidirSobreOPedido(existente, { textoHash, agora, confirmouReenvio: pedido.confirmouReenvio });

  switch (decisao.acao) {
    case "chave-reutilizada":
      return recusa(409, "CHAVE_REUTILIZADA", "Este identificador já foi usado com outro texto.");
    case "em-andamento":
      return recusa(409, "EM_ANDAMENTO", "Esta mensagem ainda está sendo enviada.");
    case "sem-confirmacao":
      return recusa(409, "SEM_CONFIRMACAO", "Não se sabe se esta mensagem saiu. Confira a conversa antes de repetir.");
    case "ja-enviado": {
      // Sai a MESMA mensagem, nenhuma cópia nova. Se a gravação tinha falhado antes, completa agora.
      let mensagem: MensagemDoChat | null = null;
      if (existente!.mensagemId) {
        const m = await prisma.whatsappMessage.findFirst({ where: { id: existente!.mensagemId, officeId: a.officeId }, include: { transcricao: { select: { status: true, texto: true, erro: true } } } });
        mensagem = m ? prepararMensagem(m, agora) : null;
      } else {
        mensagem = await gravarEntrega(existente!.id, a, pedido.clientMessageId, pedido.texto, existente!.waMessageId);
      }
      return { status: 200, corpo: { ok: true, jaTinhaSaido: true, mensagem } };
    }
    default:
      break;
  }

  // 2. A JANELA (só para quem vai mesmo enviar).
  const janela = await janelaDaConversa(a.attendance.id, a.officeId, agora);
  if (!janela.aberta) return recusa(409, "FORA_DA_JANELA", "Fora da janela de 24 h: o WhatsApp não deixa responder por texto agora.");

  // 3. A RESERVA. Quem perde a corrida recebe o estado de quem ganhou.
  let pedidoId: string;
  if (!existente) {
    try {
      const criado = await prisma.pedidoDeEnvioWhatsapp.create({
        data: { ...chave, attendanceId: a.attendance.id, userId: a.userId, clientMessageId: pedido.clientMessageId, textoHash },
        select: { id: true },
      });
      pedidoId = criado.id;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        return recusa(409, "EM_ANDAMENTO", "Esta mensagem ainda está sendo enviada.");
      }
      throw erro;
    }
  } else {
    // FALHOU ou RESERVADO antigo confirmado: a troca de estado é UMA gravação condicional. Se dois
    // pedidos chegarem juntos, só um encontra a linha ainda no estado que leu.
    const tomou = await prisma.pedidoDeEnvioWhatsapp.updateMany({
      where: { id: existente.id, estado: existente.estado, updatedAt: existente.updatedAt },
      data: { estado: "RESERVADO", erro: null, userId: a.userId },
    });
    if (tomou.count === 0) return recusa(409, "EM_ANDAMENTO", "Esta mensagem ainda está sendo enviada.");
    pedidoId = existente.id;
  }

  // 4. O ENVIO. Se o processo cair daqui até o fim, a linha fica RESERVADO: "sem confirmação".
  let resultado: SendResult;
  try {
    resultado = await enviar(a.officeId, a.attendance.waPhone, pedido.texto);
  } catch (erro) {
    console.error("[envio] falha inesperada ao chamar o WhatsApp:", mensagemDeErro(erro));
    return recusa(502, "SEM_CONFIRMACAO", "Não se sabe se esta mensagem saiu. Confira a conversa antes de repetir.");
  }

  if (!resultado.ok && resultado.incerto) {
    // Sem resposta do WhatsApp (tempo esgotado, rede caída): a mensagem PODE ter saído. Não é "recusada":
    // a reserva fica RESERVADO e antiga (updatedAt no passado), então tentar de novo cai em "sem
    // confirmação" e exige que a pessoa confirme, sabendo que pode duplicar.
    await prisma.pedidoDeEnvioWhatsapp.update({ where: { id: pedidoId }, data: { erro: (resultado.error || "sem resposta do WhatsApp").slice(0, 500), updatedAt: new Date(0) } }).catch(() => {});
    return recusa(502, "SEM_CONFIRMACAO", "Não se sabe se esta mensagem saiu. Confira a conversa antes de repetir.");
  }

  if (!resultado.ok) {
    const erroDoEnvio = resultado.error || "Não foi possível enviar a mensagem.";
    await prisma.pedidoDeEnvioWhatsapp.update({ where: { id: pedidoId }, data: { estado: "FALHOU", erro: erroDoEnvio.slice(0, 500) } }).catch(() => {});
    if (ehErroDeJanela(erroDoEnvio)) return recusa(409, "FORA_DA_JANELA", "Fora da janela de 24 h: o WhatsApp não deixa responder por texto agora.");
    return recusa(422, "RECUSADA", erroDoEnvio);
  }

  // 5. SAIU. Primeiro o fato (ENVIADO + id do WhatsApp), depois o resto.
  await prisma.pedidoDeEnvioWhatsapp
    .update({ where: { id: pedidoId }, data: { estado: "ENVIADO", waMessageId: resultado.waMessageId || null, erro: null } })
    .catch((erro) => console.error("[envio] a mensagem saiu, mas o pedido não foi marcado:", mensagemDeErro(erro)));
  const mensagem = await gravarEntrega(pedidoId, a, pedido.clientMessageId, pedido.texto, resultado.waMessageId || null);
  // UMA PESSOA ASSUMIU (só porque deu certo): a Ana cala nesta conversa.
  await silenciarAtendente(a.attendance.id, a.officeId);
  return { status: 200, corpo: { ok: true, jaTinhaSaido: false, mensagem } };
}
