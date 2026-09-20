import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import {
  paraQuemVai,
  somarMinutosDeExpediente,
  anotarTentativa,
  MINUTOS_PARA_RESPONDER,
  type PessoaDaFila,
  type TipoDeFila,
  type GatilhoDaTransferencia,
} from "@/lib/filaDeTransferencia";
import { avisarAdvogadoDoLead } from "@/lib/avisarAdvogado";

// ============================================================================
// EXECUTAR A TRANSFERÊNCIA.
//
// A decisão de PARA QUEM já foi tomada em lib/filaDeTransferencia.ts, que é função pura e testada.
// Aqui só se busca o estado, se aplica e se registra.
//
// O CURSOR AVANÇA JUNTO COM A ATRIBUIÇÃO, na mesma transação. Se ele avançasse depois, uma falha
// no meio deixaria a mesma pessoa recebendo o próximo lead também — e o rodízio viraria cascata
// sem ninguém perceber, que é o defeito mais difícil de enxergar deste sistema inteiro.
//
// TRANSFERIR É IDEMPOTENTE por conversa: `transferidoEm` só é gravado uma vez. O agente pode
// repetir a marca na mensagem seguinte (e vai repetir, se a conversa continuar), e isso não pode
// fazer o lead pular de advogado em advogado a cada frase.
// ============================================================================

export type ResultadoDaTransferencia =
  | { ok: true; paraId: string; paraNome: string; fila: TipoDeFila; aviso: string }
  | { ok: false; motivo: string };

export async function transferirLead(
  attendanceId: string,
  gatilho: GatilhoDaTransferencia,
): Promise<ResultadoDaTransferencia> {
  try {
    const atendimento = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: {
        id: true,
        officeId: true,
        transferidoEm: true,
        filaJaTentou: true,
        campanha: { select: { destino: true } },
        office: {
          select: {
            whatsappConfig: {
              select: {
                ultimoAdvogadoId: true,
                ultimaRecepcaoId: true,
                expedienteDias: true,
                expedienteInicio: true,
                expedienteFim: true,
                fusoHorario: true,
              },
            },
          },
        },
      },
    });
    if (!atendimento) return { ok: false, motivo: "atendimento não encontrado" };
    if (atendimento.transferidoEm) return { ok: false, motivo: "esta conversa já foi transferida" };

    const pessoas: PessoaDaFila[] = (
      await prisma.user.findMany({
        where: { officeId: atendimento.officeId },
        select: { id: true, name: true, role: true, active: true, isAdmin: true, recebeTransferencia: true, createdAt: true },
      })
    ).map((u) => ({
      id: u.id,
      nome: u.name,
      papel: u.role,
      ativo: u.active,
      isAdmin: u.isAdmin,
      recebeTransferencia: u.recebeTransferencia,
      criadoEm: u.createdAt,
    }));

    // "AUTOMATICO" na campanha significa "siga a regra da casa" — por isso vira nulo aqui, e não
    // um terceiro tipo de fila.
    const destinoDaCampanha = atendimento.campanha?.destino;
    const preferida: TipoDeFila | null =
      destinoDaCampanha === "ADVOGADOS" || destinoDaCampanha === "RECEPCAO" ? destinoDaCampanha : null;

    const cfg = atendimento.office.whatsappConfig;
    const escolha = paraQuemVai(
      pessoas,
      gatilho,
      {
        ultimoAdvogadoId: cfg?.ultimoAdvogadoId ?? null,
        ultimaRecepcaoId: cfg?.ultimaRecepcaoId ?? null,
      },
      preferida,
    );

    if (!escolha.pessoa) return { ok: false, motivo: escolha.motivo };

    const pessoa = escolha.pessoa;
    const fila = escolha.fila;

    const agora = new Date();
    // O RELÓGIO COMEÇA A CONTAR AQUI, e conta em minutos de EXPEDIENTE: transferido às 18h55 de
    // uma sexta, o prazo não vence às 19h10 — vence quinze minutos depois de a porta abrir na
    // segunda. Fosse relógio de parede, o rodízio giraria inteiro durante a madrugada e o lead
    // chegaria na segunda já esgotado, tendo passado por todos sem ninguém ter tido chance de ver.
    const prazo = somarMinutosDeExpediente(
      {
        dias: cfg?.expedienteDias ?? "1,2,3,4,5",
        inicio: cfg?.expedienteInicio ?? "08:00",
        fim: cfg?.expedienteFim ?? "18:00",
        fuso: cfg?.fusoHorario ?? "America/Sao_Paulo",
      },
      agora,
      MINUTOS_PARA_RESPONDER,
    );

    await prisma.$transaction([
      prisma.attendance.update({
        where: { id: attendanceId },
        data: {
          responsibleId: pessoa.id,
          transferidoEm: agora,
          transferidoPor: gatilho,
          prazoDeRespostaAte: prazo,
          filaJaTentou: anotarTentativa(atendimento.filaJaTentou, pessoa.id),
          // O atendimento sai de NOVO: alguém tem dono agora. A ETAPA DO FUNIL não é tocada — é
          // a pessoa quem move o funil, como o dono determinou.
          status: "EM_TRIAGEM",
        },
      }),
      prisma.whatsappConfig.update({
        where: { officeId: atendimento.officeId },
        data: fila === "ADVOGADOS" ? { ultimoAdvogadoId: pessoa.id } : { ultimaRecepcaoId: pessoa.id },
      }),
    ]);

    // O AVISO VEM DEPOIS DA ATRIBUIÇÃO, e depende dela: avisar alguém de um lead que ainda não é
    // dele produziria o advogado abrindo uma conversa que a tela mostra como de outra pessoa.
    // `avisarAdvogadoDoLead` nunca lança, e o resultado entra no motivo só para aparecer no
    // registro — um aviso que falhou não desfaz a transferência. O lead TEM dono; o que falta é
    // ele ter sido chamado, e para isso existe o relógio.
    const aviso = await avisarAdvogadoDoLead(attendanceId, pessoa.id, gatilho);

    revalidatePath(`/atendimento/${attendanceId}`);
    revalidatePath("/atendimento");
    revalidatePath("/atendimento/funil");

    return { ok: true, paraId: pessoa.id, paraNome: pessoa.nome, fila, aviso: aviso.motivo };
  } catch (erro) {
    // Nunca lança: quem chama está no meio de responder a um cliente, e uma falha aqui não pode
    // fazer a resposta deixar de sair. A conversa fica sem dono e alguém vê pela tela.
    console.error("[transferência] falhou:", mensagemDeErro(erro));
    return { ok: false, motivo: "falha ao transferir" };
  }
}
