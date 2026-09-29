import { prisma } from "@/lib/prisma";
import { RESERVA_EM_CURSO_MS } from "@/lib/envioDeMensagem";

// ============================================================================
// A ANA RELÊ O SILÊNCIO ANTES DE ENVIAR (regra 7.4 da proposta, N18 da auditoria A.11).
//
// O DEFEITO: `atendenteResponde` lia o estado da conversa (`deveResponder`), depois chamava o agente —
// que leva de segundos a mais de um minuto — e enviava SEM reler. Se uma pessoa respondeu nesse
// intervalo, o cliente recebia duas respostas, a da pessoa e a da máquina (e "quem escreveu, assumiu"
// era violado justamente no caso mais sensível).
//
// A REGRA: imediatamente antes de chamar o WhatsApp, a Ana relê. Ela DESISTE (não envia nada) se:
//   - uma pessoa assumiu (`agenteSilenciadoEm` preenchido) ou desligou a chave, ou o atendimento foi
//     arquivado enquanto ela redigia;
//   - qualquer mensagem de saída chegou DEPOIS da mensagem do cliente que ela está respondendo (a
//     pessoa respondeu, ou outra rodada da Ana já respondeu), exceto a confirmação automática de áudio;
//   - há um envio de pessoa em curso nesta conversa (reserva ainda RESERVADO): a pessoa já tocou em
//     Enviar, só falta o WhatsApp confirmar.
//
// `forcar` (o botão "responder à última pergunta") continua pulando SÓ a chave da conversa, como em
// `atendenteResponde`: o silêncio, o arquivamento e as duas travas novas valem sempre.
//
// AINDA HÁ UMA JANELA MENOR, de milissegundos, entre esta releitura e a chamada ao WhatsApp — a única
// forma de zerá-la seria um bloqueio de linha no banco durante uma chamada de rede, que é pior. A
// releitura troca "até mais de um minuto" por "milissegundos".
// ============================================================================

export type FotoParaAReleitura = {
  status: string;
  agenteResponde: boolean;
  agenteSilenciadoEm: Date | null;
  forcar: boolean;
  /** Existe mensagem de SAÍDA (que não seja a confirmação de áudio) depois da que a Ana responde? */
  haSaidaDepoisDaPergunta: boolean;
  envioDePessoaEmCurso: boolean;
};

export type VereditoDaReleitura = { envia: true } | { envia: false; motivo: string };

export function decidirDepoisDaReleitura(f: FotoParaAReleitura): VereditoDaReleitura {
  if (f.status === "ARQUIVADO") return { envia: false, motivo: "o atendimento foi arquivado enquanto ela redigia" };
  if (f.agenteSilenciadoEm) return { envia: false, motivo: "uma pessoa do escritório assumiu enquanto ela redigia" };
  if (!f.forcar && !f.agenteResponde) return { envia: false, motivo: "a resposta automática foi desligada enquanto ela redigia" };
  if (f.envioDePessoaEmCurso) return { envia: false, motivo: "uma pessoa do escritório está enviando uma mensagem agora" };
  if (f.haSaidaDepoisDaPergunta) return { envia: false, motivo: "já houve resposta depois da mensagem do cliente" };
  return { envia: true };
}

/** Há um envio de pessoa em curso nesta conversa? */
export async function haEnvioDePessoaEmCurso(attendanceId: string, agora: Date): Promise<boolean> {
  const n = await prisma.pedidoDeEnvioWhatsapp.count({
    where: { attendanceId, estado: "RESERVADO", updatedAt: { gt: new Date(agora.getTime() - RESERVA_EM_CURSO_MS) } },
  });
  return n > 0;
}

/** Lê o banco AGORA e decide. `pergunta` é a mensagem do cliente que a Ana está respondendo. */
export async function relerAntesDeEnviar(
  attendanceId: string,
  officeId: string,
  pergunta: { id: string; createdAt: Date },
  opcoes: { forcar: boolean; agora?: Date },
): Promise<VereditoDaReleitura> {
  const agora = opcoes.agora ?? new Date();
  const [atual, saidas, emCurso] = await Promise.all([
    prisma.attendance.findFirst({ where: { id: attendanceId, officeId }, select: { status: true, agenteResponde: true, agenteSilenciadoEm: true } }),
    prisma.whatsappMessage.count({
      where: {
        attendanceId,
        officeId,
        direction: "OUT",
        confirmacaoAutomaticaDeAudio: false,
        OR: [{ createdAt: { gt: pergunta.createdAt } }, { createdAt: pergunta.createdAt, id: { gt: pergunta.id } }],
      },
    }),
    haEnvioDePessoaEmCurso(attendanceId, agora),
  ]);
  if (!atual) return { envia: false, motivo: "o atendimento não existe mais" };
  return decidirDepoisDaReleitura({ ...atual, forcar: opcoes.forcar, haSaidaDepoisDaPergunta: saidas > 0, envioDePessoaEmCurso: emCurso });
}
