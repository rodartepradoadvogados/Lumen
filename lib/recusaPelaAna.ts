import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { criteriosDoEixo, temValorMinimo, prazoDoDocumento, type ParametrosDaAna } from "@/lib/parametrosDaAna";
import { TAMANHO_DO_TOKEN } from "@/lib/recusaDoLead";
import type { EixoRecusado } from "@/lib/agenteAtendimento";

// ============================================================================
// A RECUSA FEITA PELA ANA — e a trava que decide se ela vale.
//
// A MARCA DA ANA É UM PEDIDO, NÃO UMA ORDEM. Ela é escrita por um modelo de linguagem, e um modelo
// escreve [[RECUSAR:MATERIA]] com a mesma facilidade com que escreve qualquer outra coisa — por
// generalização, por eco de exemplo, por engano. Se a marca bastasse, o escritório que escreveu
// "não faço criminal" acabaria recusando um divórcio porque a Ana achou o caso fraco.
//
// ENTÃO O SISTEMA CONFERE, e a conferência é simples de propósito: a Ana só encerra no eixo que o
// ESCRITÓRIO ESCREVEU. Sem matéria na lista, [[RECUSAR:MATERIA]] não recusa. Sem piso, não há
// recusa por valor. E quando a marca não vale, ela NÃO É IGNORADA — vira proposta, que é o que a
// Ana deveria ter feito: o caso vai para uma pessoa com a observação de que a máquina quis
// encerrar. Ignorar em silêncio esconderia justamente o sinal de que algo está mal configurado.
//
// A MENSAGEM AO CLIENTE JÁ FOI ENVIADA quando isto roda (ver a ordem em lib/atendenteResponde.ts).
// Se a recusa virar proposta aqui, o cliente já ouviu uma despedida educada e o caso está com
// alguém — o que é ruim, mas é MUITO melhor do que o contrário: registrar recusa de um caso que o
// escritório aceita, com carta e tudo.
// ============================================================================

/** O eixo foi escrito pelo escritório? É a única coisa que autoriza a Ana a encerrar. */
export function eixoAutorizado(p: ParametrosDaAna, eixo: EixoRecusado): boolean {
  if (eixo === "VALOR") return temValorMinimo(p);
  if (eixo === "MATERIA") return criteriosDoEixo(p, "MATERIA").length > 0;
  if (eixo === "COMARCA") return criteriosDoEixo(p, "COMARCA").length > 0;
  return false;
}

/**
 * A frase que vai na carta do lead, por eixo.
 *
 * Procurada no catálogo de motivos pelo rótulo — os três padrões da plataforma já dizem exatamente
 * isto ("Fora das matérias que o escritório atende", "Comarca fora do alcance do escritório",
 * "Valor da causa abaixo do mínimo do escritório"). Achou, usa o motivo do catálogo e a carta sai
 * igual à de uma recusa feita por gente; não achou, usa o texto de reserva abaixo, porque uma
 * recusa sem motivo escrito é o que o fluxo inteiro existe para impedir.
 */
const TEXTO_DE_RESERVA: Record<EixoRecusado, string> = {
  MATERIA: "Fora das matérias que o escritório atende",
  COMARCA: "Comarca fora do alcance do escritório",
  VALOR: "Valor da causa abaixo do mínimo do escritório",
};

export async function motivoDoEixo(officeId: string, eixo: EixoRecusado): Promise<{ id: string | null; texto: string }> {
  const rotulo = TEXTO_DE_RESERVA[eixo];
  const achado = await prisma.motivoDeRecusa.findFirst({
    where: { rotulo, desativado: false, OR: [{ officeId: null }, { officeId }] },
    // O do escritório na frente do da plataforma: se ele reescreveu a frase, é a dele que o lead lê.
    orderBy: { officeId: "desc" },
    select: { id: true, rotulo: true },
  });
  return achado ? { id: achado.id, texto: achado.rotulo } : { id: null, texto: rotulo };
}

/** Registra a recusa da Ana. Sem sessão: quem decidiu foi a máquina, e isso fica escrito. */
export async function registrarRecusaDaAna(
  attendanceId: string,
  officeId: string,
  eixo: EixoRecusado,
): Promise<{ token: string }> {
  const motivo = await motivoDoEixo(officeId, eixo);
  const token = randomBytes(TAMANHO_DO_TOKEN / 2).toString("hex");

  await prisma.$transaction([
    prisma.recusaDeAtendimento.create({
      data: {
        attendanceId,
        officeId,
        motivoId: motivo.id,
        motivoTexto: motivo.texto,
        // `recusadaPorId` fica nulo e `porAgente` fica verdadeiro: é o que permite, depois, medir
        // se ela está recusando bem — e é o que a fila de recusados da Triagem mostra.
        porAgente: true,
        token,
      },
    }),
    // RECUSADO, e não ARQUIVADO: arquivado é o fim da linha, recusado é uma decisão que pode ser
    // revista — e uma recusa feita por máquina é a que mais precisa poder ser revista.
    prisma.attendance.update({ where: { id: attendanceId }, data: { status: "RECUSADO" } }),
  ]);
  return { token };
}

/** Guarda a proposta da Ana para uma pessoa decidir. Nunca sai para o cliente. */
export async function registrarProposta(attendanceId: string, texto: string): Promise<void> {
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { propostaDeRecusa: texto.slice(0, 500), propostaDeRecusaEm: new Date() },
  });
}

/** Põe o atendimento em espera pelo documento. Espera não é recusa: o status não muda. */
export async function registrarEsperaDeDocumento(
  attendanceId: string,
  p: ParametrosDaAna,
  agora = new Date(),
): Promise<Date> {
  const ate = prazoDoDocumento(agora, p.diasParaODocumento);
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      documentoAte: ate,
      documentoPendente: criteriosDoEixo(p, "DOCUMENTO").map((c) => c.valor).join(", ") || "documento pedido pela atendente",
    },
  });
  return ate;
}
