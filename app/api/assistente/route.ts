import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { assistantTools, AssistantTool } from "@/lib/assistantTools";
import {
  carregarHistorico,
  criarSessao,
  gravarMensagem,
  tituloDaPergunta,
  tocarSessao,
} from "@/lib/assistenteSessoes";
import { cabeMaisUmaPergunta, registrarUso, TETO_POR_MINUTO } from "@/lib/assistenteAuditoria";

export const dynamic = "force-dynamic";

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
// ============================================================================

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;

function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildSystemPrompt(userName: string, officeName: string): string {
  return [
    `Você é o assistente interno do escritório ${officeName}, conversando agora com ${userName}.`,
    "Você só pode responder com base em dados reais retornados pelas ferramentas disponíveis — NUNCA invente números, nomes de processos, valores financeiros, datas ou qualquer outro dado.",
    "Se uma ferramenta não retornar a informação pedida, ou não existir ferramenta para o que foi perguntado, diga honestamente que não encontrou a informação em vez de supor ou completar com conhecimento geral.",
    "Trate todos os dados de clientes, processos e informações financeiras com confidencialidade: este assistente existe apenas para uso interno do escritório, nunca para fins alheios ao contexto do escritório.",
    "Seja objetivo e cite os dados concretos (nomes, números de processo, datas, valores) que as ferramentas retornarem.",
  ].join(" ");
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.active) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { name: true } });
  const officeName = office?.name || "seu escritório";

  if (!isAssistantConfigured()) {
    return NextResponse.json(
      { error: "Assistente Claude não está configurado. Peça para um administrador configurar a chave da Anthropic." },
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

  // Filtra as ferramentas disponíveis pela permissão do usuário logado: todo
  // módulo é liberado por padrão, exceto "financeiro", que exige isAdmin ou
  // financeAccess — igual à regra usada no resto do site.
  const temAcessoFinanceiro = user.isAdmin || user.financeAccess;
  const ferramentasDisponiveis: AssistantTool[] = assistantTools.filter(
    (tool) => tool.modulo !== "financeiro" || temAcessoFinanceiro,
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
          ? await tool.executar(entrada, { userId: user.id, officeId: user.officeId })
          : `Ferramenta "${toolUse.name}" não está disponível para este usuário.`;

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
    return NextResponse.json({ resposta: respostaFinal, sessaoId, historico: messages });
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
