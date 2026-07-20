import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/currentUser";
import { assistantTools, AssistantTool } from "@/lib/assistantTools";

export const dynamic = "force-dynamic";

// ============================================================================
// Assistente Claude — chat interno do escritório
//
// Env-gated como as demais integrações (WhatsApp, Google): sem ANTHROPIC_API_KEY
// configurada, o endpoint responde 503 de forma amigável em vez de quebrar.
// A conversa é efêmera — não persistimos histórico no banco, o front reenvia
// o array `historico` a cada pergunta.
// ============================================================================

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;

function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildSystemPrompt(userName: string): string {
  return [
    `Você é o assistente interno do escritório Rodarte Prado Advogados, conversando agora com ${userName}.`,
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

  if (!isAssistantConfigured()) {
    return NextResponse.json(
      { error: "Assistente Claude não está configurado. Peça para um administrador configurar a chave da Anthropic." },
      { status: 503 },
    );
  }

  let body: { mensagem?: string; historico?: Anthropic.MessageParam[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const mensagem = (body?.mensagem || "").trim();
  if (!mensagem) {
    return NextResponse.json({ error: "Envie uma mensagem." }, { status: 400 });
  }
  const historicoRecebido = Array.isArray(body?.historico) ? body.historico : [];

  // Filtra as ferramentas disponíveis pela permissão do usuário logado: todo
  // módulo é liberado por padrão, exceto "financeiro", que exige isAdmin ou
  // financeAccess — igual à regra usada no resto do site.
  const temAcessoFinanceiro = user.isAdmin || user.financeAccess;
  const ferramentasDisponiveis: AssistantTool[] = assistantTools.filter(
    (tool) => tool.modulo !== "financeiro" || temAcessoFinanceiro,
  );
  const ferramentasPorNome = new Map(ferramentasDisponiveis.map((tool) => [tool.spec.name, tool]));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [...historicoRecebido, { role: "user", content: mensagem }];

  try {
    let rounds = 0;
    let respostaFinal = "";

    while (true) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1536,
        system: buildSystemPrompt(user.name),
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
          ? await tool.executar(entrada, { userId: user.id })
          : `Ferramenta "${toolUse.name}" não está disponível para este usuário.`;

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultado,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ resposta: respostaFinal, historico: messages });
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
