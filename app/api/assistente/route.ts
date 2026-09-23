import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { assistantTools, AssistantTool } from "@/lib/assistantTools";
import { podeVerNivel, type QuemPergunta } from "@/lib/nivelFinanceiro";
import {
  carregarHistorico,
  criarSessao,
  gravarMensagem,
  tituloDaPergunta,
  tocarSessao,
} from "@/lib/assistenteSessoes";
import { cabeMaisUmaPergunta, registrarUso, TETO_POR_MINUTO } from "@/lib/assistenteAuditoria";
import { sessaoDoHermes, gravarSessaoDoHermes } from "@/lib/assistenteSessoes";
import { hermesConfigurado, perguntarAoHermes, FalhaDoHermes } from "@/lib/hermesPonte";
import { emitirCredencial } from "@/lib/agenteCredencial";
import { procedenciaGravada, rotulosDeProcedencia } from "@/lib/agenteProcedencia";
import { urlDasFerramentasDoAgente } from "@/lib/agenteFerramentasEndereco";
import { montarPerguntaInterna, regrasDaAntonella } from "@/lib/antonella";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

export const dynamic = "force-dynamic";
// O Hermes pode levar dezenas de segundos, e depois de desistir dele ainda e preciso caber a
// resposta da reserva DENTRO da mesma funcao. Sem este teto, a Vercel cortaria antes.
export const maxDuration = 120;

// ============================================================================
// Assistente Claude — chat interno do escritório
//
// Env-gated como as demais integrações (WhatsApp, Google): sem ANTHROPIC_API_KEY
// configurada, o endpoint responde 503 de forma amigável em vez de quebrar.
//
// A CONVERSA DEIXOU DE SER EFÊMERA (19/09/2026). Antes o front reenviava o array
// `historico` inteiro a cada pergunta e nada ficava gravado: fechar a aba perdia
// tudo, trocar de aparelho perdia tudo, e uma conversa de dez turnos trafegava dez
// vezes. Agora o cliente manda só `mensagem` e `sessaoId`; o histórico sai do banco
// (ver lib/assistenteSessoes.ts) e volta cortado numa janela, para uma conversa longa
// não estourar o contexto e parar de funcionar justamente para quem mais a usa.
//
// `historico` no corpo continua aceito e IGNORADO: clientes antigos em cache não
// quebram, só deixam de mandar peso à toa.
//
// QUEM RESPONDE (18/09/2026). O dono decidiu que o assistente do escritório é o HERMES. Ele fala
// primeiro; o Claude ficou de reserva, para quando o Hermes não atender. A troca é de CÉREBRO, não
// de caixa: a conversa, o registro de uso e o limite por escritório valem para os dois, e é por
// isso que eles moram aqui e não dentro de cada um.
//
// A reserva não é enfeite. O Hermes vive numa máquina só dele, que pode estar em manutenção, sem
// rede ou com o escritório ainda não provisionado — e um assistente que emudece nesses dias não
// serve para o trabalho de ninguém. Quando a reserva entra, isso vai para a auditoria com o
// motivo, para a conta do dia seguinte não ficar sendo adivinhada.
// ============================================================================

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;

function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// O MESMO TEXTO DOS DOIS LADOS. O Hermes recebe as regras junto da pergunta; o Claude, aqui,
// como prompt de sistema. Dois textos diferentes dariam duas Antonellas, e a diferença apareceria
// justamente no dia em que a reserva entrasse — que é o dia em que ninguém está olhando.
function buildSystemPrompt(userName: string, officeName: string): string {
  return regrasDaAntonella(userName, officeName).join(" ");
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const office = await prisma.office.findUnique({
    where: { id: user.officeId },
    select: { name: true, slug: true },
  });
  const officeName = office?.name || "seu escritório";

  // Nenhum dos dois configurado: não há o que tentar, e dizer isso é mais útil que uma falha
  // genérica lá na frente.
  if (!hermesConfigurado() && !isAssistantConfigured()) {
    return NextResponse.json(
      { error: "O assistente não está configurado. Peça para um administrador ligar o Hermes ou a chave da Anthropic." },
      { status: 503 },
    );
  }

  let body: { mensagem?: string; sessaoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const mensagem = (body?.mensagem || "").trim();
  if (!mensagem) {
    return NextResponse.json({ error: "Envie uma mensagem." }, { status: 400 });
  }
  // LIMITE DE USO, por escritório (ver lib/assistenteAuditoria.ts). Checado ANTES de qualquer
  // trabalho: recusar depois de já ter consultado o banco e chamado a API não limita nada.
  const { cabe, usadas } = await cabeMaisUmaPergunta(user.officeId);
  if (!cabe) {
    await registrarUso({
      officeId: user.officeId,
      userId: user.id,
      acao: "RECUSA_LIMITE",
      detalhe: `${usadas} perguntas no último minuto (teto ${TETO_POR_MINUTO})`,
    });
    return NextResponse.json(
      { error: "O assistente atingiu o limite de perguntas deste minuto no escritório. Tente de novo em instantes." },
      { status: 429 },
    );
  }

  // Sessão: a primeira pergunta cria. O título sai dela — ver tituloDaPergunta.
  let sessaoId = typeof body?.sessaoId === "string" ? body.sessaoId : "";
  if (sessaoId) {
    // Confere dono ANTES de carregar: sem isto, passar o id da conversa de um colega leria o
    // histórico dele.
    const dona = await prisma.assistantSession.findFirst({
      where: { id: sessaoId, userId: user.id, officeId: user.officeId },
      select: { id: true },
    });
    if (!dona) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  } else {
    const nova = await criarSessao(user.id, user.officeId, tituloDaPergunta(mensagem));
    sessaoId = nova.id;
  }

  const historicoRecebido = await carregarHistorico(sessaoId);

  await registrarUso({ officeId: user.officeId, userId: user.id, sessionId: sessaoId, acao: "PERGUNTA" });

  // ── O HERMES RESPONDE ─────────────────────────────────────────────────────────────────────
  // Ele guarda o próprio contexto na máquina dele e o retoma pelo id gravado na conversa — por
  // isso aqui não vai histórico junto, só a pergunta. As mensagens continuam sendo gravadas deste
  // lado: é o que a tela mostra, o que a auditoria consulta, e o que sobra se um dia aquela
  // máquina for reinstalada.
  if (hermesConfigurado() && office?.slug) {
    // Marco de tempo ANTES da pergunta: é o que separa o que foi consultado agora do que foi
    // consultado na pergunta anterior da mesma conversa. Um segundo de folga porque o relógio do
    // banco e o desta função não são o mesmo relógio.
    const antesDaPergunta = new Date(Date.now() - 1000);
    try {
      // A permissão viaja com a pergunta. `temAcessoFinanceiro` é a MESMA regra que a tela usa —
      // administrador ou acesso expresso — e é decidida aqui, do lado de cá, nunca pelo agente.
      const credencial = await emitirCredencial({
        officeId: user.officeId,
        userId: user.id,
        financeiro: Boolean(user.isAdmin || user.financeAccess),
        admin: Boolean(user.isAdmin),
        // ESTA É UMA PERGUNTA DE CHAT, não uma geração de peça: escopo "conversa" — cinco
        // minutos, o catálogo inteiro que a permissão financeira já filtra. Ver
        // lib/agenteCredencial.ts (EscopoDaCredencial) e a parede por escopo em
        // app/api/agente/ferramentas/route.ts.
        escopo: "conversa",
        sessionId: sessaoId,
      });

      const resposta = await perguntarAoHermes({
        slug: office.slug,
        // As regras da Antonella viajam com a pergunta — ver lib/antonella.ts. O perfil do Hermes
        // na máquina tem personalidade própria, e sem isto seria ELA quem responderia ao
        // advogado: um agente de propósito geral, que opina, que inventa e que não sabe que
        // existe uma regra sobre o financeiro.
        mensagem: montarPerguntaInterna({
          nomeDoUsuario: user.name,
          nomeDoEscritorio: officeName,
          mensagem,
        }),
        sessao: await sessaoDoHermes(sessaoId),
        ferramentas: { url: urlDasFerramentasDoAgente(), credencial },
      });

      await gravarMensagem(sessaoId, "user", mensagem);
      await gravarMensagem(sessaoId, "assistant", resposta.resposta);
      if (resposta.sessao) await gravarSessaoDoHermes(sessaoId, resposta.sessao);
      await tocarSessao(sessaoId);
      await registrarUso({
        officeId: user.officeId,
        userId: user.id,
        sessionId: sessaoId,
        acao: "FERRAMENTA",
        ferramenta: "hermes",
        detalhe: "respondeu",
      });

      // A linha de procedência sai do registro de uso, não do texto do agente — ver
      // lib/agenteProcedencia.ts. Se a leitura falhar, a resposta vai sem a linha: perder a
      // procedência é ruim, perder a resposta por causa dela seria pior.
      let procedencia: string[] = [];
      try {
        procedencia = await procedenciaGravada(user.id, sessaoId, antesDaPergunta);
      } catch (erro) {
        console.error("[assistente] não foi possível ler a procedência:", mensagemDeErro(erro));
      }

      return NextResponse.json({ resposta: resposta.resposta, sessaoId, procedencia });
    } catch (erro) {
      const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
      console.error("[assistente] Hermes indisponível:", motivo);

      // O motivo entra na auditoria. Sem ele, "por que o Hermes não respondeu ontem" vira
      // adivinhação, e a reserva passa despercebida justamente quando está sendo usada todo dia.
      await registrarUso({
        officeId: user.officeId,
        userId: user.id,
        sessionId: sessaoId,
        acao: "FERRAMENTA",
        ferramenta: "hermes",
        detalhe: `indisponível: ${motivo}`,
      });

      if (!isAssistantConfigured()) {
        // A PESSOA PRECISA SABER QUAL DOS DOIS É. "Indisponível" mandou o dono investigar a
        // máquina por uma manhã inteira quando o problema era o agente estar lento — e lento e
        // fora do ar pedem providências opostas: uma é esperar ou trocar o modelo, a outra é
        // levantar o serviço.
        const demorou = motivo.startsWith("DEMORA");
        return NextResponse.json(
          {
            error: demorou
              ? "O agente demorou mais do que o limite para responder. Ele continua no ar — a pergunta é que levou tempo demais. Tente de novo, ou peça algo mais simples."
              : "Não foi possível alcançar o agente do escritório agora. Tente novamente em instantes.",
          },
          { status: 503 },
        );
      }
      // Sem `return`: a execução segue para a reserva, logo abaixo.
    }
  }

  // ── A RESERVA: o Claude, com as ferramentas de leitura da casa ─────────────────────────────

  // Filtra as ferramentas disponíveis pela permissão do usuário logado: todo módulo é liberado
  // por padrão, exceto "financeiro" — e AQUI DENTRO do financeiro, `consultar_indicadores` (nível
  // "indicador") só é liberada para sócio, exatamente como na rota do Hermes
  // (app/api/agente/ferramentas/route.ts:liberada). Corrigido nesta entrega: antes esta lista só
  // olhava o MÓDULO, então quem tinha `financeAccess` sem ser `isAdmin` via `consultar_indicadores`
  // oferecida pela reserva mesmo sem ser sócio — a regra existia, mas só do lado do Hermes. A
  // MESMA função (`podeVerNivel`) decide dos dois lados agora, para não haver dois portões que
  // possam divergir.
  const quemPergunta: QuemPergunta = { financeiro: Boolean(user.isAdmin || user.financeAccess), admin: Boolean(user.isAdmin) };
  const ferramentasDisponiveis: AssistantTool[] = assistantTools.filter(
    (tool) => tool.modulo !== "financeiro" || podeVerNivel(tool.nivel ?? "indicador", quemPergunta),
  );
  const ferramentasPorNome = new Map(ferramentasDisponiveis.map((tool) => [tool.spec.name, tool]));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const pergunta: Anthropic.MessageParam = { role: "user", content: mensagem };
  const messages: Anthropic.MessageParam[] = [...historicoRecebido, pergunta];
  await gravarMensagem(sessaoId, "user", mensagem);
  // Índice de onde começam as mensagens NOVAS desta rodada — é o que será gravado no fim. Regravar
  // o histórico carregado duplicaria a conversa a cada pergunta.
  const inicioDoNovo = messages.length;

  try {
    let rounds = 0;
    let respostaFinal = "";
    // Na reserva a procedência não precisa de consulta ao banco: as chamadas acontecem aqui
    // dentro, e o nome de cada uma passa por esta função.
    const consultadas: string[] = [];

    while (true) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1536,
        system: buildSystemPrompt(user.name, officeName),
        tools: ferramentasDisponiveis.map((tool) => tool.spec),
        messages,
      });

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      messages.push({ role: "assistant", content: response.content });

      if (toolUseBlocks.length === 0 || rounds >= MAX_TOOL_ROUNDS) {
        const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
        respostaFinal =
          textBlock?.text ||
          (toolUseBlocks.length > 0
            ? "Não consegui concluir a consulta dentro do limite de tentativas. Tente reformular a pergunta."
            : "");
        break;
      }

      rounds += 1;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        // Defesa em profundidade: mesmo que o modelo tente chamar uma ferramenta
        // não oferecida (ex.: financeiro sem permissão), o executor barra aqui.
        const tool = ferramentasPorNome.get(toolUse.name);
        const entrada = toolUse.input && typeof toolUse.input === "object" ? (toolUse.input as Record<string, unknown>) : {};
        const resultado = tool
          ? await tool.executar(entrada, {
              userId: user.id,
              officeId: user.officeId,
              // Mesma dupla usada para montar `ferramentasDisponiveis` acima — permite a uma
              // ferramenta que NÃO é do financeiro (histórico do cliente, assessorias) omitir só
              // o bloco de dinheiro que carrega por dentro, em vez de tudo ou nada.
              financeiro: quemPergunta.financeiro,
              admin: quemPergunta.admin,
            })
          : `Ferramenta "${toolUse.name}" não está disponível para este usuário.`;
        // Só o que foi de fato executado. Uma ferramenta barrada por permissão não leu nada, e
        // anunciá-la embaixo da resposta diria à pessoa o contrário do que a resposta diz.
        if (tool) consultadas.push(toolUse.name);

        // Rastro de PROCEDÊNCIA: é esta linha que responde "de onde veio esse número". Sem ela, a
        // auditoria diria que houve uma pergunta e não diria o que foi consultado por baixo.
        await registrarUso({
          officeId: user.officeId,
          userId: user.id,
          sessionId: sessaoId,
          acao: "FERRAMENTA",
          ferramenta: toolUse.name,
          detalhe: tool ? JSON.stringify(entrada) : "ferramenta indisponível para este usuário",
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultado,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    // Grava só o que a rodada acrescentou, e só depois de ela terminar: se a API falhar no meio,
    // a conversa não fica com um turno pela metade no banco.
    for (const m of messages.slice(inicioDoNovo)) {
      await gravarMensagem(sessaoId, m.role === "assistant" ? "assistant" : "user", m.content);
    }
    await tocarSessao(sessaoId);

    // `historico` continua na resposta para o cliente antigo não quebrar; o novo usa `sessaoId`.
    return NextResponse.json({
      resposta: respostaFinal,
      sessaoId,
      procedencia: rotulosDeProcedencia(consultadas),
      historico: messages,
    });
  } catch (error) {
    console.error("[assistente] erro ao chamar a API da Anthropic:", error);

    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Chave da Anthropic inválida. Peça para um administrador verificar a configuração." },
        { status: 503 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "O assistente está com muitas solicitações agora. Tente novamente em instantes." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "O assistente não conseguiu responder agora. Tente novamente em instantes." },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "Erro inesperado ao falar com o assistente." }, { status: 500 });
  }
}
