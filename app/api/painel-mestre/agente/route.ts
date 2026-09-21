import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember, type PlatformViewer } from "@/lib/platformMember";
import { painelMestreFerramentas, ferramentaLiberada } from "@/lib/painelMestreFerramentas";
import { orcamentoDoPedido, type TurnoDoPainelMestre } from "@/lib/painelMestreOrcamento";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================================
// O AGENTE DO PAINEL MESTRE (F7) — chat interno da EQUIPE DA LÚMEN sobre a máquina da
// plataforma. Fala com a API da Anthropic diretamente (não com o servidor do Hermes, que é a
// infraestrutura do agente DO ESCRITÓRIO, numa máquina à parte) — não há razão para um chat
// operacional da própria equipe da plataforma depender de uma VPS de terceiro escritório.
//
// LEI 1 — HERDA A CREDENCIAL DE QUEM PERGUNTOU. `resolveViewer` abaixo é o ÚNICO lugar que decide
// quem está perguntando, e é ele — nunca o corpo da requisição — quem determina o
// `PlatformViewer` que viaja até cada ferramenta. Não existe parâmetro no corpo que eleve nível
// de acesso: mesmo que o corpo mandasse um `maxVisibility: "COFRE"`, ele seria ignorado, porque
// `body` só é lido para `mensagem` e `historico`.
// ============================================================================

const MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;

function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Quem está perguntando — dono cru da plataforma (`User.isPlatformOwner`) OU PlatformMember
 * ativo (`getPlatformMember`, que já cobre os dois caminhos de login de equipe — Passo 1 da
 * fundação de dados).
 *
 * O DONO CRU SINTETIZA UM VIEWER equivalente ao papel SOCIO — a MESMA equivalência que
 * lib/supportAccess.ts:resolveCallingMember já usa para o dono poder abrir sessão de suporte
 * mesmo sem uma linha de PlatformMember cadastrada. Nunca inventamos um teto MAIOR que SOCIO: o
 * comentário do schema é literal — "ninguém alcança COFRE, nem sócio" — e o dono da plataforma
 * não é exceção a essa regra só por ser o dono.
 */
async function resolveViewer(): Promise<PlatformViewer | null> {
  const user = await getCurrentUser({ ignoreActing: true });
  if (user?.isPlatformOwner) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleKey: "SOCIO",
      maxVisibility: "QUEBRA_VIDRO",
      canManageBilling: true,
      canManageMembers: true,
      canApproveAccess: true,
    };
  }
  return getPlatformMember();
}

function buildSystemPrompt(viewerName: string): string {
  return [
    `Você é o agente interno do Painel Mestre da Lúmen. Quem pergunta é ${viewerName}, da equipe da Lúmen — não um escritório-cliente conversando com você.`,
    "Você responde perguntas OPERACIONAIS sobre a plataforma: escritórios, cobrança dos escritórios, saúde do provisionamento do Hermes, campanhas pagas pendentes de aprovação, a equipe da Lúmen, e — só quando houver sessão de suporte aberta para aquele escritório — a atividade interna dele.",
    "Você NUNCA inventa número, nome ou estado. Toda afirmação vem só do que as ferramentas devolveram nesta conversa.",
    'Quando uma ferramenta devolver `{"recusado": true, "motivo": ...}`, diga esse motivo com todas as letras — nunca tente adivinhar o dado por outro caminho, e nunca ofereça um número aproximado no lugar.',
    'Quando um campo vier com `{"omitido": true, "motivo": ...}`, diga que o valor foi omitido e por quê — nunca invente um número no lugar dele.',
    "Você é SOMENTE LEITURA: nenhuma ferramenta sua cria, altera ou apaga qualquer coisa, e você nunca deve dar a entender que uma ação foi executada.",
  ].join(" ");
}

export async function POST(request: NextRequest) {
  if (!isAssistantConfigured()) {
    return NextResponse.json(
      { error: "O agente do Painel Mestre não está configurado. Peça para um administrador ligar a chave da Anthropic." },
      { status: 503 },
    );
  }

  const viewer = await resolveViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Não autenticado no Painel Mestre." }, { status: 401 });
  }

  let body: { mensagem?: string; historico?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const mensagem = (body?.mensagem || "").trim();
  if (!mensagem) {
    return NextResponse.json({ error: "Envie uma mensagem." }, { status: 400 });
  }

  // Sem sessão gravada em banco nesta primeira entrega (ver relatório) — a conversa vive na
  // aba, e volta a cada pergunta como `historico`. TETO BRUTO aqui (nunca confia no tamanho que
  // o cliente mandou); o corte FINO, que decide o que de fato entra no pedido, é
  // `orcamentoDoPedido` logo abaixo — dois filtros, o mesmo espírito de "checado duas vezes" do
  // financeiro.
  const historicoRecebido: TurnoDoPainelMestre[] = Array.isArray(body?.historico)
    ? (body.historico as unknown[])
        .filter((t): t is TurnoDoPainelMestre => {
          const turno = t as { role?: unknown; texto?: unknown } | null;
          return Boolean(turno) && (turno!.role === "user" || turno!.role === "assistant") && typeof turno!.texto === "string";
        })
        .slice(-40)
    : [];

  // LEI 1: a lista de ferramentas OFERECIDAS já é filtrada pelo teto de quem pergunta — o modelo
  // nem fica sabendo que `consultar_indicadores_da_plataforma` ou `consultar_atividade_do_
  // escritorio` existem quando o papel não alcança. `executar` de cada ferramenta faz a MESMA
  // checagem de novo por dentro (ver lib/painelMestreFerramentas.ts) — dupla checagem, mesmo
  // padrão do financeiro em app/api/agente/ferramentas/route.ts.
  const ferramentasDisponiveis = painelMestreFerramentas.filter((tool) => ferramentaLiberada(tool, viewer));
  const ferramentasPorNome = new Map(ferramentasDisponiveis.map((tool) => [tool.spec.name, tool]));

  const systemPrompt = buildSystemPrompt(viewer.name);
  const orcamento = orcamentoDoPedido({ textoFixo: systemPrompt, historico: historicoRecebido, pergunta: mensagem });
  if (!orcamento.cabe) {
    return NextResponse.json({ error: orcamento.motivo }, { status: 400 });
  }

  const messages: Anthropic.MessageParam[] = [
    ...orcamento.historico.map((turno) => ({ role: turno.role, content: turno.texto }) as Anthropic.MessageParam),
    { role: "user", content: mensagem },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let rounds = 0;
    let respostaFinal = "";

    while (true) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1536,
        system: systemPrompt,
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
        // Defesa em profundidade: mesmo que o modelo tente chamar uma ferramenta não oferecida
        // (ex.: indicadores da plataforma sem canManageBilling), o executor barra de novo aqui —
        // ver ferramentaLiberada() e a checagem interna de cada `executar`.
        const tool = ferramentasPorNome.get(toolUse.name);
        const entrada =
          toolUse.input && typeof toolUse.input === "object" ? (toolUse.input as Record<string, unknown>) : {};
        const resultado = tool
          ? await tool.executar(entrada, viewer)
          : `Ferramenta "${toolUse.name}" não está disponível para o seu papel na equipe da Lúmen.`;
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: resultado });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ resposta: respostaFinal });
  } catch (erro) {
    console.error("[painel-mestre/agente] falha:", mensagemDeErro(erro));
    return NextResponse.json(
      { error: "Não foi possível falar com o agente do Painel Mestre agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }
}
