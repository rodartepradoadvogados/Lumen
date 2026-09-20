import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { deveResponder, montarPergunta, lerDecisaoDaAna } from "@/lib/agenteAtendimento";
import { lerParametros } from "@/lib/actions/parametrosDaAna";
import { textoDosParametros } from "@/lib/parametrosDaAna";
import {
  eixoAutorizado,
  registrarRecusaDaAna,
  registrarProposta,
  registrarEsperaDeDocumento,
} from "@/lib/recusaPelaAna";
import { transferirLead } from "@/lib/transferirLead";
import { perguntarAoHermes, hermesConfigurado, FalhaDoHermes, ESPERA_MS as ESPERA_PADRAO_DO_HERMES_MS } from "@/lib/hermesPonte";
import { sendWhatsappText } from "@/lib/whatsapp";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { textoParaAgente } from "@/lib/transcricaoDeAudio";
import { esperaParaHermes } from "@/lib/orcamentoDoPedido";

// ============================================================================
// O ATENDENTE RESPONDE (ou explica por que não).
//
// Esta função nunca lança. Ela é chamada da rota que recebe o webhook do WhatsApp, e ali um erro
// não pode virar erro HTTP: a Evolution reenviaria a mesma mensagem em laço, e o cliente receberia
// a mesma resposta várias vezes. Falhou, registra e devolve o motivo.
//
// A DECISÃO NÃO MORA AQUI — mora em `deveResponder`, que é pura e testada. Aqui só se busca o
// estado, se pergunta ao agente e se envia. É de propósito: a parte que decide se uma máquina
// fala com um cliente de verdade tem que caber num teste de mesa.
// ============================================================================

const QUANTAS_MENSAGENS_DE_CONTEXTO = 10;

type CampanhaDoAtendimento = {
  sobre: string;
  primeiraMensagem: string;
  tetoDeMensagens: number;
  mensagemDeTransferencia: string;
  motivosDeRecusa: string[];
  perguntas: { texto: string }[];
  documentos: { nome: string; paraQue: string | null; obrigatorio: boolean }[];
};

/**
 * Monta o roteiro da campanha no texto que o agente lê.
 *
 * Os documentos OBRIGATÓRIOS são marcados como tais aqui, e não só no banco: sem isso o agente
 * trataria todos igual, e o documento obrigatório existe justamente para ser diferente — é ele
 * que decide se o lead avança ou vai para o formulário.
 */
function textoDaCampanha(c: CampanhaDoAtendimento | null): string | null {
  if (!c) return null;
  const partes: string[] = [c.sobre];

  if (c.primeiraMensagem?.trim()) {
    partes.push(`\nSe esta for a sua primeira resposta na conversa, comece assim: "${c.primeiraMensagem.trim()}"`);
  }
  if (c.perguntas.length > 0) {
    partes.push("\nAS PERGUNTAS DESTA TRIAGEM, nesta ordem, uma por mensagem:");
    c.perguntas.forEach((p, i) => partes.push(`${i + 1}. ${p.texto}`));
  }
  if (c.documentos.length > 0) {
    partes.push("\nOS DOCUMENTOS A PEDIR, um de cada vez, dizendo para que serve cada um:");
    for (const d of c.documentos) {
      const marca = d.obrigatorio ? " [OBRIGATÓRIO — sem ele o caso não avança]" : "";
      partes.push(`- ${d.nome}${d.paraQue ? ` (${d.paraQue})` : ""}${marca}`);
    }
  }
  if (c.mensagemDeTransferencia?.trim()) {
    partes.push(`\nAo encerrar e transferir, diga: "${c.mensagemDeTransferencia.trim()}"`);
  }
  if (c.motivosDeRecusa.length > 0) {
    partes.push(
      "\nSE APARECER QUALQUER UMA DESTAS SITUAÇÕES, encerre cordialmente em vez de seguir a triagem:",
      ...c.motivosDeRecusa.map((m) => `- ${m}`),
    );
  }
  partes.push(`\nNão passe de ${c.tetoDeMensagens} mensagens do cliente sem concluir: além disso, transfira.`);
  return partes.join("\n");
}

export async function atendenteResponde(
  attendanceId: string,
  opcoes: {
    forcar?: boolean;
    /**
     * Quanto sobrou do orçamento de tempo do PEDIDO que chamou esta função (ver
     * lib/orcamentoDoPedido.ts) — só as rotas de webhook (app/api/whatsapp/route.ts e
     * .../evolution/route.ts) passam isto, porque só elas correm contra um `maxDuration` que
     * também cobre o download da mídia e a transcrição do áudio, feitos ANTES desta chamada.
     * `undefined` (o botão manual "Responder à última pergunta", em lib/actions/attendance.ts)
     * mantém o comportamento de sempre: o Hermes espera o padrão de ESPERA_PADRAO_DO_HERMES_MS.
     */
    orcamentoRestanteMs?: number;
  } = {},
): Promise<{ respondeu: boolean; motivo: string }> {
  try {
    const atendimento = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: {
        id: true,
        officeId: true,
        clientName: true,
        waPhone: true,
        status: true,
        agenteResponde: true,
        agenteSilenciadoEm: true,
        campanha: {
          select: {
            sobre: true,
            primeiraMensagem: true,
            tetoDeMensagens: true,
            mensagemDeTransferencia: true,
            motivosDeRecusa: true,
            perguntas: { select: { texto: true }, orderBy: { ordem: "asc" } },
            documentos: {
              select: { nome: true, paraQue: true, obrigatorio: true },
              orderBy: { ordem: "asc" },
            },
          },
        },
        office: {
          select: {
            name: true,
            slug: true,
            moduloWhatsapp: true,
            whatsappConfig: {
              select: {
                agenteAtivo: true,
                agenteTodos: true,
                agenteNumeros: true,
                agenteNome: true,
                agenteInstrucoes: true,
              },
            },
          },
        },
      },
    });

    if (!atendimento || !atendimento.waPhone) {
      return { respondeu: false, motivo: "atendimento sem WhatsApp vinculado" };
    }
    const config = atendimento.office.whatsappConfig;
    if (!config) return { respondeu: false, motivo: "WhatsApp não configurado" };
    if (!config.agenteAtivo) {
      return { respondeu: false, motivo: "o atendente de IA está desligado neste escritório" };
    }

    // `forcar` é o botão "responder à última pergunta", que existe porque marcar a chave no meio
    // de uma conversa vale da PRÓXIMA mensagem em diante. Ele pula a chave da conversa — e só
    // ela: módulo, silêncio, arquivamento e lista de números continuam valendo, porque essas são
    // as travas que protegem o cliente, não as que controlam a conveniência.
    const veredito = deveResponder(
      {
        moduloWhatsapp: atendimento.office.moduloWhatsapp,
        agenteAtivo: config.agenteAtivo,
        agenteTodos: config.agenteTodos,
        agenteNumeros: config.agenteNumeros,
      },
      {
        agenteResponde: opcoes.forcar ? true : atendimento.agenteResponde,
        agenteSilenciadoEm: atendimento.agenteSilenciadoEm,
        status: atendimento.status,
      },
      atendimento.waPhone,
    );
    if (!veredito.responde) return { respondeu: false, motivo: veredito.motivo };

    if (!hermesConfigurado()) {
      return { respondeu: false, motivo: "a ponte com o agente não está configurada" };
    }

    const mensagens = await prisma.whatsappMessage.findMany({
      where: { attendanceId },
      orderBy: { createdAt: "desc" },
      take: QUANTAS_MENSAGENS_DE_CONTEXTO,
      // A transcrição (quando a mensagem é um áudio) entra junto: textoParaAgente decide o que
      // vai no lugar do rótulo cru "[áudio]" — ver lib/transcricaoDeAudio.ts.
      select: { direction: true, body: true, transcricao: { select: { status: true, texto: true, erro: true } } },
    });
    const emOrdem = mensagens.reverse();
    const ultima = emOrdem[emOrdem.length - 1];

    // A última mensagem tem que ser DO CLIENTE. Se a última é do escritório, não há pergunta
    // pendente — responder aqui seria o atendente falando sozinho.
    if (!ultima || ultima.direction !== "IN") {
      return { respondeu: false, motivo: "a última mensagem não é do cliente" };
    }

    const parametros = await lerParametros(atendimento.officeId);

    const pergunta = montarPergunta({
      nomeDoAtendente: config.agenteNome?.trim() || "Atendimento",
      nomeDoEscritorio: atendimento.office.name,
      instrucoesDoEscritorio: config.agenteInstrucoes,
      campanha: textoDaCampanha(atendimento.campanha),
      parametros: textoDosParametros(parametros),
      nomeDoCliente: atendimento.clientName,
      // TRANSCRIÇÃO NO LUGAR DO ÁUDIO, nas duas pontas do histórico: nas mensagens de contexto
      // (historico) E na mensagem de agora — quando é a ÚLTIMA mensagem que é um áudio (o caso
      // comum: a pessoa acabou de mandar a voz), a Ana precisa da transcrição dela também, não só
      // das anteriores. textoParaAgente já resolve os dois casos (áudio transcrito, áudio que
      // falhou, mensagem comum) com a mesma regra.
      historico: emOrdem.slice(0, -1).map((m) => ({
        de: m.direction === "IN" ? ("cliente" as const) : ("escritorio" as const),
        texto: textoParaAgente(m),
      })),
      mensagem: textoParaAgente(ultima),
    });

    let resposta: string;
    try {
      // SEM FERRAMENTAS. O atendente do WhatsApp fala com CLIENTE, e cliente não pode puxar dado
      // do escritório — nem o dele próprio, porque quem escreve naquele número ainda não foi
      // identificado. As ferramentas são do agente interno, que fala com quem fez login.
      //
      // O TEMPO QUE SOBROU, E NÃO MAIS QUE ISSO. `esperaParaHermes` nunca deixa o Hermes esperar
      // mais do que o padrão de sempre (ESPERA_PADRAO_DO_HERMES_MS) — só MENOS, quando o download
      // da mídia e a transcrição do áudio já consumiram parte do orçamento do pedido inteiro. Ver
      // lib/orcamentoDoPedido.ts para o motivo (o bug que isto conserta: 105s do Hermes + até 60s
      // da transcrição somavam mais que os 120s da própria função).
      const esperaMs = esperaParaHermes(opcoes.orcamentoRestanteMs, ESPERA_PADRAO_DO_HERMES_MS);
      const r = await perguntarAoHermes({ slug: atendimento.office.slug, mensagem: pergunta, esperaMs });
      resposta = (r.resposta || "").trim();
    } catch (erro) {
      const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
      console.error("[atendente] agente indisponível:", motivo);
      return { respondeu: false, motivo: `agente indisponível: ${motivo}` };
    }

    // AS MARCAS SAEM ANTES DE QUALQUER COISA. Elas são combinadas entre nós e o agente; vazar
    // "[[TRANSFERIR:RISCO]]" para o WhatsApp de um cliente é constrangimento puro — e vazar o
    // recado interno que vem depois de [[PROPOR_RECUSA]] ("acho que não devemos pegar este caso")
    // seria muito pior do que constrangimento.
    const decisao = lerDecisaoDaAna(resposta);
    resposta = decisao.texto;
    let gatilho = decisao.gatilho;

    // A TRAVA. A marca da Ana é um pedido, não uma ordem: ela só encerra no eixo que o ESCRITÓRIO
    // escreveu. Marca sem autorização não é ignorada — vira proposta, que é o que ela deveria ter
    // feito. Ignorar em silêncio esconderia o sinal de que algo está mal configurado. Ver a nota
    // inteira em lib/recusaPelaAna.ts.
    let recusa = decisao.recusa;
    let proposta = decisao.proposta;
    if (recusa && !eixoAutorizado(parametros, recusa)) {
      proposta =
        `A atendente quis encerrar por ${recusa.toLowerCase()}, mas o escritório não tem esse critério ` +
        `configurado. ${proposta ?? ""}`.trim();
      recusa = null;
    }
    // Quem propõe transfere: proposta sem gente do outro lado é uma observação que ninguém lê. Vai
    // para a fila dos advogados porque decidir não pegar uma causa é decisão de advogado.
    if (proposta && !gatilho) gatilho = "RISCO";

    if (!resposta) {
      // Sem texto não há o que enviar — mas pode haver o que fazer. Uma decisão sem mensagem quer
      // dizer que a Ana só escreveu marcas; o caso segue para uma pessoa em vez de ficar parado.
      if (proposta) await registrarProposta(attendanceId, proposta);
      if (gatilho) await transferirLead(attendanceId, gatilho);
      return { respondeu: false, motivo: "o agente devolveu resposta vazia" };
    }

    const envio = await sendWhatsappText(atendimento.officeId, atendimento.waPhone, resposta);
    if (!envio.ok) {
      return { respondeu: false, motivo: envio.error || "falha ao enviar" };
    }

    await prisma.whatsappMessage.create({
      data: {
        officeId: atendimento.officeId,
        attendanceId,
        direction: "OUT",
        porAgente: true,
        body: resposta,
        waMessageId: envio.waMessageId || null,
        status: "SENT",
        fromNumber: atendimento.waPhone,
      },
    });
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { waLastMessageAt: new Date() },
    });

    // A TRANSFERÊNCIA VEM DEPOIS DO ENVIO, e é de propósito. A mensagem de despedida já saiu; se
    // a fila falhar agora, o cliente ao menos foi despedido com educação e a conversa fica sem
    // dono para alguém ver na tela. O contrário — transferir e a mensagem não sair — deixaria o
    // advogado com um lead que não sabe que foi atendido.
    // A DECISÃO VEM DEPOIS DO ENVIO, pela mesma razão da transferência: a mensagem de despedida já
    // saiu. Recusar antes e falhar o envio deixaria o lead com status RECUSADO sem nunca ter sido
    // avisado — e a carta é justamente o que o escritório manda depois, à mão.
    let sobreADecisao = "";
    if (recusa) {
      await registrarRecusaDaAna(attendanceId, atendimento.officeId, recusa);
      sobreADecisao += ` · RECUSADO pela atendente (${recusa.toLowerCase()}) — na fila de recusados da Triagem`;
      // Recusa não transfere: o caso saiu das listas ativas e já está na fila de análise.
      gatilho = null;
    }
    if (proposta) {
      await registrarProposta(attendanceId, proposta);
      sobreADecisao += " · a atendente PROPÔS recusar — quem decide é o advogado";
    }
    if (decisao.aguardarDocumento && !recusa) {
      // `!recusa` porque encerrar e esperar ao mesmo tempo é contradição, e entre as duas vale a
      // que já está escrita no status.
      const ate = await registrarEsperaDeDocumento(attendanceId, parametros);
      sobreADecisao += ` · esperando documento até ${ate.toISOString().slice(0, 10)}`;
    }

    let sobreATransferencia = "";
    if (gatilho) {
      const r = await transferirLead(attendanceId, gatilho);
      sobreATransferencia = r.ok
        ? ` · transferido para ${r.paraNome} (${r.fila.toLowerCase()}, motivo ${gatilho}) · ${r.aviso}`
        : ` · NÃO transferido: ${r.motivo}`;
    }

    revalidatePath(`/atendimento/${attendanceId}`);
    revalidatePath("/atendimento");
    return { respondeu: true, motivo: `respondido pelo atendente${sobreADecisao}${sobreATransferencia}` };
  } catch (erro) {
    // Nunca lança: ver a nota no topo.
    console.error("[atendente] falha inesperada:", mensagemDeErro(erro));
    return { respondeu: false, motivo: "falha inesperada ao responder" };
  }
}

/**
 * Cala o atendente NESTA conversa, para sempre, porque uma pessoa do escritório assumiu.
 *
 * Idempotente: chamada de novo, não mexe na data da primeira vez — é a primeira que interessa.
 */
export async function silenciarAtendente(attendanceId: string, officeId: string): Promise<void> {
  try {
    // `updateMany` com `agenteSilenciadoEm: null` no filtro é o que torna a operação idempotente:
    // chamada de novo, não encontra linha e não mexe na data da primeira vez — e é a primeira que
    // interessa, porque é ela que diz quando o humano entrou.
    //
    // O rastro fica no próprio atendimento, e não na auditoria do assistente: quem vai perguntar
    // "por que o atendente parou de responder aqui?" está olhando a conversa, não um relatório.
    await prisma.attendance.updateMany({
      where: { id: attendanceId, officeId, agenteSilenciadoEm: null },
      data: { agenteSilenciadoEm: new Date(), agenteResponde: false },
    });
  } catch (erro) {
    console.error("[atendente] falha ao silenciar:", mensagemDeErro(erro));
  }
}
