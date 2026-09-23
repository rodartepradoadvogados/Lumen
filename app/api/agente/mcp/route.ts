import { NextRequest, NextResponse } from "next/server";
import { lerCredencial, type PermissaoDaPergunta } from "@/lib/agenteCredencial";
import { motivoDaRecusa, explicacaoDaRecusa } from "@/lib/nivelFinanceiro";
import { assistantTools, type ToolInput } from "@/lib/assistantTools";
import { registrarUso } from "@/lib/assistenteAuditoria";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { liberada, nomesDisponiveis, COMO_MOSTRAR } from "@/lib/agenteFerramentasLiberadas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================================
// O MESMO CATÁLOGO DE FERRAMENTAS, FALADO EM MCP — para o Hermes consumir DIRETO.
//
// A PONTE (servidor-hermes/servidor.py) sempre entregou ao Hermes duas variáveis de ambiente a
// cada pergunta — LUMEN_FERRAMENTAS_URL e LUMEN_FERRAMENTAS_CREDENCIAL — mas nada na instalação do
// Hermes as lia: existia um script (servidor-hermes/lumen-consultar.py) pensado para ser chamado
// como comando de terminal por INSTRUÇÃO DE PROMPT, e essa instrução nunca chegou a entrar no
// perfil de verdade. Resultado medido: as sete ferramentas do peticionamento e as do atendimento
// nunca chegaram ao agente do Hermes — só funcionavam pela RESERVA (app/api/assistente/route.ts),
// onde é o próprio Lúmen que chama o modelo e já entrega as specs.
//
// O Hermes já fala MCP (há servidores MCP configurados no `config.yaml` de um perfil da VPS,
// inclusive um `mcp-remote@latest` e um com `url:`), então esta rota expõe as MESMAS ferramentas
// como um servidor MCP — "streamable HTTP": JSON-RPC 2.0 sobre POST, sem WebSocket e sem SSE.
//
// A CREDENCIAL CONTINUA SENDO A MESMA E CHEGA DA MESMA FORMA — Authorization: Bearer <token>, lida
// por `lerCredencial`. É isto que fecha o desenho: a ponte já põe essa credencial numa variável de
// ambiente ANTES de lançar o processo do Hermes para aquela pergunta, e um servidor MCP que o
// Hermes lance (ou que ele acesse via `url:` interpolada com essa variável) HERDA esse ambiente.
// A credencial continua sendo POR PERGUNTA — carregando quem perguntou e o que essa pessoa pode
// ver — exatamente a razão de ela existir (ver o cabeçalho de lib/agenteCredencial.ts). Nada aqui
// muda esse contrato: muda só o transporte.
//
// UMA SÓ FONTE DE VERDADE. `liberada`, `FERRAMENTAS_DO_PETICIONAMENTO` e `COMO_MOSTRAR` vêm de
// lib/agenteFerramentasLiberadas.ts — o MESMO módulo que app/api/agente/ferramentas/route.ts usa.
// Esta rota é o QUARTO lugar que decide o que uma credencial alcança (ao lado da execução REST, da
// lista de erro REST e do catálogo REST), e por isso importa a regra em vez de escrevê-la de novo.
// Duas cópias divergiriam no primeiro dia em que alguém mexesse numa só — e a divergência seria
// muda: nenhum teste do lado que não mudou acusaria nada. `lib/testes/agenteMcp.teste.ts` prova
// isto rodando as DUAS rotas com a MESMA credencial e comparando o conjunto de nomes.
//
// SEM SESSÃO, SEM ESTADO. Cada requisição HTTP se basta: `initialize` não abre um estado que
// `tools/call` dependa depois — a credencial de cada requisição já diz tudo o que a requisição
// pode fazer. Isto é o que permite reusar `lerCredencial` sem inventar um armazenamento de sessão
// que este ambiente serverless não tem onde guardar.
//
// ERRO DE FERRAMENTA NÃO É ERRO DE PROTOCOLO. `tools/call` que não existe, que a credencial não
// alcança, ou cuja execução falhou volta como um RESULTADO (`content` + `isError: true`) — nunca
// como erro JSON-RPC. Erro JSON-RPC é reservado para o que é do PROTOCOLO: corpo inválido, método
// desconhecido, e a autorização (que barra a conversa antes mesmo de haver um método a cumprir).
// ============================================================================

const NOME_DO_SERVIDOR = "lumen-ferramentas";
const VERSAO_DO_SERVIDOR = "1.0.0";

// As versões do protocolo MCP que esta rota entende. A mais nova é a que oferecemos quando o
// cliente pede uma versão que não reconhecemos — nunca inventamos uma versão nova aqui.
const VERSOES_SUPORTADAS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const VERSAO_PADRAO = VERSOES_SUPORTADAS[0];

type IdJsonRpc = string | number | null;

type CorpoJsonRpc = {
  jsonrpc?: unknown;
  id?: IdJsonRpc;
  method?: unknown;
  params?: unknown;
};

function temId(corpo: CorpoJsonRpc): boolean {
  // JSON-RPC: uma NOTIFICAÇÃO é uma Request sem o campo `id` — mesmo `id: null` conta como
  // presente (ver a especificação). `"id" in corpo` e não `corpo.id !== undefined`, porque um
  // corpo poderia ter `id: undefined` explicitamente e ainda assim não ter a CHAVE.
  return Object.prototype.hasOwnProperty.call(corpo, "id");
}

function respostaOk(id: IdJsonRpc, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function respostaErroJsonRpc(id: IdJsonRpc, status: number, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

/** Um resultado de `tools/call` que FALHOU — não é erro de protocolo, é erro de FERRAMENTA. */
function resultadoDeErro(texto: string) {
  return { content: [{ type: "text", text: texto }], isError: true };
}

function resultadoDeTexto(dado: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(dado) }] };
}

export async function POST(request: NextRequest) {
  let corpo: CorpoJsonRpc;
  try {
    corpo = await request.json();
  } catch {
    return respostaErroJsonRpc(null, 400, -32700, "Corpo inválido: não é JSON.");
  }

  const ehObjeto = !!corpo && typeof corpo === "object";
  if (!ehObjeto || typeof corpo.method !== "string") {
    return respostaErroJsonRpc(ehObjeto && temId(corpo) ? (corpo.id ?? null) : null, 400, -32600, "Requisição inválida.");
  }

  const id: IdJsonRpc = temId(corpo) ? (corpo.id ?? null) : null;
  const metodo = corpo.method;
  const ehNotificacao = !temId(corpo);

  // `notifications/initialized` (e qualquer outra notificação): sem `id`, então sem resposta —
  // é o próprio protocolo que exige isto. 202 Accepted, corpo vazio, nada de credencial: uma
  // notificação não pede dado nenhum de volta, então não há nada aqui para uma credencial ausente
  // proteger.
  if (ehNotificacao) {
    return new NextResponse(null, { status: 202 });
  }

  // A CREDENCIAL, para todo método que espera resposta — inclusive `initialize`: nesta ponte o
  // servidor MCP nasce (ou é apontado) JÁ para UMA pergunta específica, com a credencial daquela
  // pergunta no ambiente; não existe um "handshake anônimo" seguido de perguntas autenticadas
  // depois, porque não há sessão nenhuma entre uma requisição e a próxima (ver o cabeçalho acima).
  const cabecalho = request.headers.get("authorization") || "";
  if (!cabecalho.startsWith("Bearer ")) {
    return respostaErroJsonRpc(id, 401, -32001, "Credencial ausente.");
  }
  const permissao = await lerCredencial(cabecalho.slice(7).trim());
  if (!permissao) {
    // Não se distingue "expirada" de "inválida" na resposta — mesmo raciocínio da rota REST
    // (app/api/agente/ferramentas/route.ts): quem está do outro lado não precisa saber qual dos
    // dois, e a diferença só ajudaria quem estivesse tentando adivinhar.
    return respostaErroJsonRpc(id, 401, -32001, "Credencial inválida ou expirada.");
  }

  switch (metodo) {
    case "initialize":
      return tratarInitialize(id, corpo.params);
    case "tools/list":
      return respostaOk(id, { tools: catalogoMcp(permissao) });
    case "tools/call":
      return tratarToolsCall(id, corpo.params, permissao);
    default:
      // Método desconhecido É erro de protocolo — não há ferramenta nenhuma para recusar aqui,
      // é o próprio MCP que não tem esse método.
      return respostaErroJsonRpc(id, 200, -32601, `Método desconhecido: "${metodo}".`);
  }
}

function tratarInitialize(id: IdJsonRpc, params: unknown) {
  const pedida =
    params && typeof params === "object" && typeof (params as { protocolVersion?: unknown }).protocolVersion === "string"
      ? (params as { protocolVersion: string }).protocolVersion
      : "";
  const protocolVersion = (VERSOES_SUPORTADAS as readonly string[]).includes(pedida) ? pedida : VERSAO_PADRAO;

  return respostaOk(id, {
    protocolVersion,
    // SÓ `tools`, e vazio: nada de `resources`, `prompts` ou `logging` — este servidor não
    // oferece nenhum deles, e anunciar uma capacidade que não existe é o mesmo tipo de mentira
    // que o catálogo já evita cometer com uma ferramenta fora de alcance.
    capabilities: { tools: {} },
    serverInfo: { name: NOME_DO_SERVIDOR, version: VERSAO_DO_SERVIDOR },
  });
}

/** O catálogo MCP — MESMA regra (`liberada`) que o catálogo REST (GET) usa, só o formato muda:
 *  `input_schema` (Anthropic.Tool) vira `inputSchema` (MCP). Renomear o campo, não reescrever o
 *  esquema — as specs já existem e já são compatíveis. */
function catalogoMcp(permissao: PermissaoDaPergunta) {
  return assistantTools
    .filter((t) => liberada(t, permissao))
    .map((t) => ({
      name: t.spec.name,
      description: t.spec.description,
      inputSchema: t.spec.input_schema,
    }));
}

async function tratarToolsCall(id: IdJsonRpc, params: unknown, permissao: PermissaoDaPergunta) {
  const p = params && typeof params === "object" ? (params as { name?: unknown; arguments?: unknown }) : {};
  const nome = typeof p.name === "string" ? p.name.trim() : "";
  if (!nome) {
    // Isto sim é erro de PROTOCOLO: a chamada não trouxe o nome da ferramenta — não há ferramenta
    // nenhuma ainda para recusar ou executar.
    return respostaErroJsonRpc(id, 400, -32602, "Parâmetros inválidos: informe `name`.");
  }

  const ferramenta = assistantTools.find((t) => t.spec.name === nome);
  if (!ferramenta) {
    return respostaOk(id, resultadoDeErro(`Ferramenta "${nome}" não existe. Disponíveis: ${nomesDisponiveis(permissao).join(", ")}`));
  }

  // A REGRA INEXORÁVEL, exatamente como na rota REST: mesmo que o Hermes peça, mesmo com `f` e
  // `a` forjados verdadeiros no token, sem acesso ao financeiro não sai número de financeiro — e
  // uma credencial de peticionamento não alcança nada fora da lista branca, ponto. `liberada` é
  // IMPORTADA de lib/agenteFerramentasLiberadas.ts: é a MESMA função que decidiu se esta
  // ferramenta apareceu em `tools/list`.
  if (!liberada(ferramenta, permissao)) {
    const nivel = ferramenta.nivel ?? "indicador";
    await registrarUso({
      officeId: permissao.officeId,
      userId: permissao.userId,
      sessionId: permissao.sessionId ?? null,
      acao: "FERRAMENTA",
      ferramenta: nome,
      // O prefixo "recusada:" é o que lib/agenteProcedencia.ts usa para NÃO listar esta consulta
      // como fonte da resposta, e o que lib/agenteUso.ts conta separadamente. Mexer nele quebra
      // os dois em silêncio — o MESMO prefixo, com o MESMO significado, da rota REST.
      detalhe: `recusada: ${motivoDaRecusa(nivel, permissao) ?? "sem permissão"}`,
    });
    return respostaOk(id, resultadoDeErro(explicacaoDaRecusa(nivel, permissao)));
  }

  const entrada: ToolInput = p.arguments && typeof p.arguments === "object" ? (p.arguments as ToolInput) : {};

  try {
    const resultado = await ferramenta.executar(entrada, {
      userId: permissao.userId,
      officeId: permissao.officeId,
      // A MESMA dupla que decidiu se esta ferramenta foi oferecida (`liberada`, acima) chega até
      // quem a executa — ver o mesmo comentário na rota REST e em lib/assistantTools.ts.
      financeiro: permissao.financeiro,
      admin: permissao.admin,
    });

    await registrarUso({
      officeId: permissao.officeId,
      userId: permissao.userId,
      sessionId: permissao.sessionId ?? null,
      acao: "FERRAMENTA",
      ferramenta: nome,
      detalhe: JSON.stringify(entrada),
    });

    // A INSTRUÇÃO VIAJA COM O DADO — dentro do MESMO `content` de texto, e não só no prompt do
    // perfil. Ver o comentário de COMO_MOSTRAR em lib/agenteFerramentasLiberadas.ts: um prompt
    // mora na máquina do agente e se perde quando o perfil é recriado; isto chega junto de cada
    // `tools/call`, e por isso não se perde.
    return respostaOk(id, resultadoDeTexto({ resultado, instrucao: COMO_MOSTRAR }));
  } catch (erro) {
    console.error(`[agente/mcp] falha em ${nome}:`, mensagemDeErro(erro));
    // Falha de EXECUÇÃO também não é erro de protocolo — é a ferramenta que não respondeu, não o
    // MCP que quebrou. Mesma mensagem genérica da rota REST (502 lá, isError aqui): quem está do
    // outro lado não precisa do detalhe interno.
    return respostaOk(id, resultadoDeErro("Não foi possível consultar agora."));
  }
}
