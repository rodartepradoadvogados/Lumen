import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { emitirCredencial } from "@/lib/agenteCredencial";
import { assistantTools } from "@/lib/assistantTools";

// ============================================================================
// A ROTA MCP (app/api/agente/mcp/route.ts) — o Hermes passou a falar MCP DIRETO com o Lúmen, no
// lugar do script de terminal que a ponte já preparava o ambiente para (LUMEN_FERRAMENTAS_URL /
// LUMEN_FERRAMENTAS_CREDENCIAL) mas que nada, na instalação real do Hermes, chegou a chamar.
//
// O QUE SE PROVA AQUI, em ordem:
//
//   1. `initialize` devolve capacidades e versão do protocolo.
//   2. `tools/list` sem credencial (ou com credencial inválida) → erro de autorização, não 200.
//   3. `tools/list` com escopo "conversa" → o catálogo inteiro (nada regrediu).
//   4. `tools/list` com escopo "peticionamento" → EXATAMENTE a lista branca — nem uma a mais.
//      4b. cada item vem no formato MCP (`inputSchema`), não no formato Anthropic (`input_schema`).
//   5. A PROVA CONTRA A DIVERGÊNCIA — o teste mais importante do lote: para a MESMA credencial,
//      `tools/list` do MCP e o `GET` da rota REST devolvem EXATAMENTE o mesmo conjunto de nomes.
//      Rodado para os dois escopos e para várias combinações de financeiro/sócio. Se um dia
//      alguém mudar a regra de acesso NUM lugar só, este teste reprova — e é a prova de que as
//      duas rotas de fato compartilham `liberada()` (lib/agenteFerramentasLiberadas.ts), e não
//      duas cópias.
//   6. A parede do escopo, mesmo com `f`/`a` forjados verdadeiros no token — pelo `tools/list`
//      (seguro: não toca o banco) — e a MESMA ordem (liberada ANTES de executar) confirmada por
//      leitura do código-fonte de `tratarToolsCall`, onde a chamada de verdade a `tools/call`
//      tocaria `registrarUso` → Prisma, indisponível neste ambiente (ver o bloco abaixo).
//   7. `tools/call` de ferramenta inexistente → `isError: true`, nunca um crash nem um erro de
//      protocolo — e este caminho NÃO toca `registrarUso`/Prisma, então é seguro invocar de
//      verdade (mesma disciplina do 404 da rota REST).
//   8. Método JSON-RPC desconhecido, corpo que não é JSON, e `tools/call` sem `name` → erro
//      JSON-RPC, nunca 500. `notifications/initialized` → sem resposta (202, corpo vazio).
//   9. `COMO_MOSTRAR` viaja com o resultado — confirmado por leitura do código-fonte, pelo mesmo
//      motivo do item 6: o caminho de SUCESSO de `tools/call` também chama `registrarUso`.
//
// NADA AQUI TOCA O BANCO — mesma disciplina de lib/testes/agenteEscopoPeticionamento.teste.ts e
// lib/testes/transcricaoAssincrona.teste.ts: este ambiente não tem acesso de rede ao Postgres (só
// HTTPS/443), e uma chamada real a um caminho que grava em `AssistantAuditLog` ficaria pendurada.
// Por isso os DOIS ramos de `tratarToolsCall` que chamam `registrarUso` — a recusa (`liberada` ==
// false) e o sucesso — são verificados por LEITURA DO CÓDIGO, nunca por execução de verdade; só o
// ramo "ferramenta não existe" (que retorna ANTES de qualquer `registrarUso`) é seguro de invocar
// ao vivo, e por isso é o único dos três exercitado com uma chamada HTTP real.
// ============================================================================

process.env.AUTH_SECRET = "segredo-de-teste-que-nao-abre-nada-em-lugar-nenhum";
const CHAVE = new TextEncoder().encode(process.env.AUTH_SECRET);
const PUBLICO = "lumen-agente-ferramentas";

// A LISTA BRANCA, copiada aqui DE PROPÓSITO (não importada do módulo compartilhado): o ponto do
// teste é notar se ALGUÉM MUDAR a lista de lib/agenteFerramentasLiberadas.ts sem querer —
// importar a mesma constante faria o teste aprovar qualquer lista, certa ou errada.
const LISTA_BRANCA_ESPERADA = [
  "consultar_perfil_do_escritorio",
  "consultar_processos",
  "consultar_atendimento",
  "buscar_cliente",
  "consultar_historico_cliente",
  "consultar_documentos",
  "consultar_assessorias",
].sort();

async function credencialForjada(campos: Record<string, unknown>): Promise<string> {
  return new SignJWT(campos)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(CHAVE);
}

type ItemDoCatalogoMcp = { name: string; description?: string; inputSchema?: unknown };

type ResultadoDeToolsCall = { content?: Array<{ type: string; text: string }>; isError?: boolean };

type ResultadoMcp = {
  protocolVersion?: string;
  capabilities?: { tools?: Record<string, unknown> };
  serverInfo?: { name?: string; version?: string };
  tools?: ItemDoCatalogoMcp[];
} & ResultadoDeToolsCall;

type CorpoDeRespostaMcp = { jsonrpc?: string; id?: unknown; result?: ResultadoMcp; error?: { code: number; message: string } };

type RespostaMcp = {
  status: number;
  corpo: CorpoDeRespostaMcp | null;
};

async function mcpChamar(token: string | null, corpoDaChamada: Record<string, unknown>): Promise<RespostaMcp> {
  const { POST } = await import("@/app/api/agente/mcp/route");
  const { NextRequest } = await import("next/server");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const req = new NextRequest("http://localhost/api/agente/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(corpoDaChamada),
  });
  const res = await POST(req);
  let corpo: RespostaMcp["corpo"] = null;
  try {
    corpo = await res.json();
  } catch {
    corpo = null;
  }
  return { status: res.status, corpo };
}

/** POST com corpo cru (não necessariamente JSON válido) — para o teste de "corpo inválido". */
async function mcpChamarCru(corpoCru: string): Promise<{ status: number; corpo: CorpoDeRespostaMcp }> {
  const { POST } = await import("@/app/api/agente/mcp/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/agente/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: corpoCru,
  });
  const res = await POST(req);
  const corpo = (await res.json()) as CorpoDeRespostaMcp;
  return { status: res.status, corpo };
}

async function mcpListar(token: string): Promise<{ status: number; nomes: string[]; itens: ItemDoCatalogoMcp[] }> {
  const { status, corpo } = await mcpChamar(token, { jsonrpc: "2.0", id: "lista", method: "tools/list" });
  const itens = corpo?.result?.tools ?? [];
  return { status, nomes: itens.map((t) => t.name), itens };
}

async function restCatalogo(token: string): Promise<{ status: number; nomes: string[] }> {
  const { GET } = await import("@/app/api/agente/ferramentas/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/agente/ferramentas", {
    headers: { authorization: `Bearer ${token}` },
  });
  const res = await GET(req);
  const corpo = (await res.json()) as { ferramentas?: { nome: string }[] };
  return { status: res.status, nomes: (corpo.ferramentas ?? []).map((f) => f.nome) };
}

// ── 1. initialize ────────────────────────────────────────────────────────────────────────────

teste("initialize devolve capacidades e a versão do protocolo", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { status, corpo } = await mcpChamar(t, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18" },
  });
  igual(status, 200);
  igual(corpo?.jsonrpc, "2.0");
  igual(corpo?.id, 1);
  verdade(corpo?.result, "initialize deveria devolver `result`");
  igual(typeof corpo?.result?.protocolVersion, "string", "protocolVersion: ");
  verdade((corpo?.result?.protocolVersion?.length ?? 0) > 0, "protocolVersion veio vazio");
  igual(corpo?.result?.capabilities?.tools, {}, "capabilities.tools: ");
  verdade(typeof corpo?.result?.serverInfo?.name === "string" && corpo.result.serverInfo.name.length > 0, "serverInfo.name ausente");
  verdade(typeof corpo?.result?.serverInfo?.version === "string" && corpo.result.serverInfo.version.length > 0, "serverInfo.version ausente");
});

teste("initialize com uma protocolVersion que o servidor não reconhece cai para a padrão, sem quebrar", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { status, corpo } = await mcpChamar(t, {
    jsonrpc: "2.0",
    id: 2,
    method: "initialize",
    params: { protocolVersion: "1999-01-01-nao-existe" },
  });
  igual(status, 200);
  verdade(typeof corpo?.result?.protocolVersion === "string" && corpo.result.protocolVersion.length > 0, "protocolVersion ausente");
  verdade(corpo?.result?.protocolVersion !== "1999-01-01-nao-existe", "ecoou de volta uma versão inventada pelo cliente");
});

// ── 2. autorização ───────────────────────────────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO: tools/list SEM credencial → erro de autorização, não 200", async () => {
  const { status, corpo } = await mcpChamar(null, { jsonrpc: "2.0", id: 3, method: "tools/list" });
  igual(status, 401);
  verdade(corpo?.error, "deveria vir com campo `error`");
  igual(corpo?.result, undefined, "não deveria ter `result` junto de um erro");
});

teste("tools/list com credencial ASSINADA COM OUTRO SEGREDO → erro de autorização", async () => {
  const outraChave = new TextEncoder().encode("outro-segredo-qualquer");
  const t = await new SignJWT({ o: "esc1", u: "u1", f: false, a: false, c: "conversa", s: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(outraChave);
  const { status, corpo } = await mcpChamar(t, { jsonrpc: "2.0", id: 4, method: "tools/list" });
  igual(status, 401);
  verdade(corpo?.error, "deveria vir com campo `error`");
});

teste("tools/list com credencial EXPIRADA E com credencial de OUTRO SEGREDO devolvem A MESMA mensagem — não se distingue uma da outra", async () => {
  // Não é que a mensagem EVITE a palavra "expirada" — ela sempre cita as duas hipóteses (ver o
  // comentário da rota REST: "Credencial inválida ou expirada."). O que não pode acontecer é a
  // resposta MUDAR conforme o motivo real: quem está do outro lado não pode usar o teor da
  // mensagem para adivinhar se estava perto de acertar (token quase certo, só vencido) ou
  // completamente errado (assinado com outra chave). As duas têm de soar IDÊNTICAS.
  const expirada = await new SignJWT({ o: "esc1", u: "u1", f: false, a: false, c: "conversa", s: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
    .sign(CHAVE);
  const outraChave = new TextEncoder().encode("outro-segredo-qualquer-2");
  const outroSegredo = await new SignJWT({ o: "esc1", u: "u1", f: false, a: false, c: "conversa", s: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(outraChave);

  const respostaExpirada = await mcpChamar(expirada, { jsonrpc: "2.0", id: 5, method: "tools/list" });
  const respostaOutroSegredo = await mcpChamar(outroSegredo, { jsonrpc: "2.0", id: 5, method: "tools/list" });

  igual(respostaExpirada.status, 401);
  igual(respostaOutroSegredo.status, 401);
  igual(
    respostaExpirada.corpo?.error?.message,
    respostaOutroSegredo.corpo?.error?.message,
    "a mensagem de credencial expirada divergiu da de credencial inválida — dá para distinguir uma da outra: ",
  );
});

teste("initialize TAMBÉM exige credencial — não é um handshake anônimo antes da autenticação", async () => {
  // Esta ponte não tem sessão: o servidor MCP já nasce (ou é apontado) para UMA pergunta, com a
  // credencial daquela pergunta no ambiente. Não existe "initialize sem dono, depois autentica".
  const { status, corpo } = await mcpChamar(null, { jsonrpc: "2.0", id: 6, method: "initialize" });
  igual(status, 401);
  verdade(corpo?.error, "initialize sem credencial deveria vir com erro");
});

// ── 3. escopo conversa: catálogo inteiro (nada regrediu) ────────────────────────────────────────

teste("tools/list com escopo conversa devolve o catálogo INTEIRO (financeiro e sócio)", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: true, escopo: "conversa" });
  const { status, nomes } = await mcpListar(t);
  igual(status, 200);
  igual(nomes.length, assistantTools.length, "o catálogo MCP de conversa perdeu ferramentas");
  verdade(nomes.includes("consultar_agenda"), "consultar_agenda sumiu do escopo conversa");
  verdade(nomes.includes("consultar_financeiro"), "consultar_financeiro sumiu (sócio com acesso)");
  verdade(nomes.includes("consultar_indicadores"), "consultar_indicadores sumiu (sócio)");
});

teste("tools/list com escopo conversa sem acesso ao financeiro não vê financeiro/indicadores (segunda camada)", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { nomes } = await mcpListar(t);
  verdade(!nomes.includes("consultar_financeiro"), "consultar_financeiro vazou");
  verdade(!nomes.includes("consultar_indicadores"), "consultar_indicadores vazou");
});

// ── 4. escopo peticionamento: exatamente a lista branca ─────────────────────────────────────────

teste("MUTAÇÃO-ALVO: tools/list com escopo peticionamento é EXATAMENTE a lista branca — nem a mais, nem a menos", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: true, escopo: "peticionamento" });
  const { nomes } = await mcpListar(t);
  igual(nomes.slice().sort(), LISTA_BRANCA_ESPERADA);
});

teste("cada item do catálogo MCP vem no FORMATO MCP (inputSchema), não no formato Anthropic (input_schema)", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { itens } = await mcpListar(t);
  verdade(itens.length > 0, "o catálogo veio vazio");
  for (const item of itens) {
    verdade(typeof item.name === "string" && item.name.length > 0, "item sem `name`");
    verdade(typeof item.description === "string" && item.description.length > 0, `"${item.name}" sem \`description\``);
    verdade(item.inputSchema && typeof item.inputSchema === "object", `"${item.name}" sem \`inputSchema\``);
    verdade(!("input_schema" in item), `"${item.name}" vazou o campo Anthropic \`input_schema\` em vez de \`inputSchema\``);
  }
});

// ── 5. A PROVA CONTRA A DIVERGÊNCIA — o teste mais importante do lote ───────────────────────────
//
// Para a MESMA credencial, o catálogo do MCP (`tools/list`) e o catálogo REST (`GET`) têm de
// devolver EXATAMENTE o mesmo conjunto de nomes — nos dois escopos, e em várias combinações de
// financeiro/sócio (incluindo o caso "sócio sem acesso ao financeiro", que `podeVerNivel` fecha
// antes mesmo de olhar `admin`). Se alguém mudar a regra de acesso NUM lugar só (por exemplo,
// fazer o MCP importar `liberada` de uma cópia local em vez do módulo compartilhado), este teste
// reprova — comprovado por mutação durante o desenvolvimento desta entrega.

const COMBINACOES_DE_ACESSO: Array<{ escopo: "conversa" | "peticionamento"; financeiro: boolean; admin: boolean }> = [
  { escopo: "conversa", financeiro: false, admin: false },
  { escopo: "conversa", financeiro: true, admin: false },
  { escopo: "conversa", financeiro: true, admin: true },
  { escopo: "conversa", financeiro: false, admin: true }, // admin sem financeiro: fail-closed em podeVerNivel
  { escopo: "peticionamento", financeiro: false, admin: false },
  { escopo: "peticionamento", financeiro: true, admin: true },
];

for (const combinacao of COMBINACOES_DE_ACESSO) {
  teste(`PROVA CONTRA DIVERGÊNCIA: MCP tools/list == REST GET para ${JSON.stringify(combinacao)}`, async () => {
    const t = await emitirCredencial({ officeId: "esc1", userId: "u1", ...combinacao });
    const [doMcp, doRest] = await Promise.all([mcpListar(t), restCatalogo(t)]);
    igual(doMcp.status, 200);
    igual(doRest.status, 200);
    igual(
      doMcp.nomes.slice().sort(),
      doRest.nomes.slice().sort(),
      `MCP e REST divergiram para ${JSON.stringify(combinacao)}: `,
    );
  });
}

// ── 6. A parede do escopo, mesmo forjada — e a ordem certa dentro de tools/call ─────────────────

teste("MUTAÇÃO-ALVO: tools/list do MCP — escopo peticionamento não alcança financeiro/indicadores mesmo com f e a forjados verdadeiros", async () => {
  // FORJADO de propósito: o token diz `f: true, a: true` — exatamente o que um sócio com acesso
  // ao financeiro carregaria numa credencial de CONVERSA. A prova das DUAS camadas é que, em
  // escopo "peticionamento", isso não importa: a parede do escopo barra antes mesmo de a regra do
  // financeiro ser consultada. Mesma prova de lib/testes/agenteEscopoPeticionamento.teste.ts,
  // repetida aqui porque a rota MCP É o quarto lugar que decide, e pode divergir sozinha.
  const t = await credencialForjada({ o: "esc1", u: "u1", f: true, a: true, c: "peticionamento", s: "" });
  const { status, nomes } = await mcpListar(t);
  igual(status, 200);
  verdade(!nomes.includes("consultar_financeiro"), "consultar_financeiro vazou para o escopo peticionamento no MCP");
  verdade(!nomes.includes("consultar_indicadores"), "consultar_indicadores vazou para o escopo peticionamento no MCP");
  verdade(!nomes.includes("consultar_agenda"), "consultar_agenda (fora da lista branca) vazou para o escopo peticionamento no MCP");
});

// NÃO HÁ, ABAIXO, UMA CHAMADA HTTP DE VERDADE a `tools/call` com uma ferramenta que EXISTE mas
// está fora do alcance da credencial: esse ramo específico de `tratarToolsCall` chama
// `registrarUso` (Prisma) ANTES de responder, e uma chamada de verdade a esse ramo, neste
// ambiente sem rede para o Postgres, ficaria pendurada — exatamente o defeito de teste que
// lib/testes/agenteEscopoPeticionamento.teste.ts e lib/testes/transcricaoAssincrona.teste.ts já
// evitam pelo mesmo motivo. A prova de "fora de alcance dentro de tools/call" vem por LEITURA DE
// CÓDIGO, logo abaixo — e a prova RUNTIME da mesma trava vem pelo `tools/list` forjado, acima
// (MUTAÇÃO-ALVO anterior), que exercita a MESMA função `liberada` sem tocar o banco.

// A leitura de código-fonte de `tratarToolsCall`, pelo motivo do cabeçalho do arquivo: o ramo de
// recusa E o de sucesso chamam `registrarUso` (Prisma), e uma chamada de verdade a esse ramo
// ficaria pendurada neste ambiente. O que se prova por leitura:
//
//   · `liberada(ferramenta, permissao)` é chamada ANTES de `ferramenta.executar(` — a ordem que
//     garante que uma ferramenta fora de alcance nunca chega a executar;
//   · entre as duas chamadas há um `return` que devolve `resultadoDeErro(...)` — ou seja, a
//     recusa de fato interrompe o fluxo, e não é só uma checagem solta sem efeito;
//   · a recusa usa `explicacaoDaRecusa`/`motivoDaRecusa` com o prefixo "recusada:" — o MESMO
//     prefixo de que lib/agenteProcedencia.ts e lib/agenteUso.ts dependem (ver o comentário da
//     rota REST).
const FONTE_MCP = readFileSync("app/api/agente/mcp/route.ts", "utf8");

teste("MUTAÇÃO-ALVO: tratarToolsCall chama `liberada` ANTES de `ferramenta.executar`, e a recusa de fato retorna", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_MCP, "tratarToolsCall"));
  verdade(corpo.length > 500, `corpoDaFuncao não achou tratarToolsCall (${corpo.length} caracteres)`);

  const idxLiberada = corpo.indexOf("liberada(ferramenta, permissao)");
  const idxExecutar = corpo.indexOf("ferramenta.executar(");
  verdade(idxLiberada >= 0, "tratarToolsCall não chama liberada(ferramenta, permissao)");
  verdade(idxExecutar >= 0, "tratarToolsCall não chama ferramenta.executar(");
  verdade(idxLiberada < idxExecutar, "liberada() é chamada DEPOIS de ferramenta.executar() — a ordem inverteu a trava");

  const entreAsDuas = corpo.slice(idxLiberada, idxExecutar);
  verdade(entreAsDuas.includes("return"), "não há `return` entre a checagem de liberada e a execução — a recusa não interrompe o fluxo");
  verdade(entreAsDuas.includes("resultadoDeErro("), "a recusa não devolve resultadoDeErro(...)");
});

teste("MUTAÇÃO-ALVO: a recusa de tools/call usa motivoDaRecusa/explicacaoDaRecusa com o prefixo \"recusada:\"", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_MCP, "tratarToolsCall"));
  verdade(corpo.includes("recusada: ${motivoDaRecusa(nivel, permissao)"), 'a recusa não grava com o prefixo "recusada: " + motivoDaRecusa(...)');
  verdade(corpo.includes("resultadoDeErro(explicacaoDaRecusa(nivel, permissao))"), "a recusa não devolve explicacaoDaRecusa(...) no resultado");
});

teste("tratarToolsCall importa `liberada` do módulo compartilhado — não define a regra de novo", () => {
  verdade(
    /import\s*\{[^}]*\bliberada\b[^}]*\}\s*from\s*["']@\/lib\/agenteFerramentasLiberadas["']/.test(FONTE_MCP),
    "app/api/agente/mcp/route.ts não importa `liberada` de lib/agenteFerramentasLiberadas",
  );
  const semComentarios = codigoDe(FONTE_MCP);
  verdade(!/function\s+liberada\s*\(/.test(semComentarios), "app/api/agente/mcp/route.ts declara sua PRÓPRIA função `liberada` — divergência à espreita");
  verdade(!/const\s+FERRAMENTAS_DO_PETICIONAMENTO/.test(semComentarios), "app/api/agente/mcp/route.ts declara sua PRÓPRIA lista branca — divergência à espreita");
});

teste("a rota REST TAMBÉM importa `liberada` do módulo compartilhado — as DUAS portas, uma fonte só", () => {
  const fonteRest = readFileSync("app/api/agente/ferramentas/route.ts", "utf8");
  verdade(
    /import\s*\{[^}]*\bliberada\b[^}]*\}\s*from\s*["']@\/lib\/agenteFerramentasLiberadas["']/.test(fonteRest),
    "app/api/agente/ferramentas/route.ts não importa `liberada` de lib/agenteFerramentasLiberadas",
  );
  const semComentarios = codigoDe(fonteRest);
  verdade(!/function\s+liberada\s*\(/.test(semComentarios), "app/api/agente/ferramentas/route.ts voltou a declarar sua PRÓPRIA `liberada`");
  verdade(!/const\s+FERRAMENTAS_DO_PETICIONAMENTO/.test(semComentarios), "app/api/agente/ferramentas/route.ts voltou a declarar sua PRÓPRIA lista branca");
});

// ── 7. tools/call de ferramenta inexistente ─────────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO: tools/call de ferramenta INEXISTENTE → isError, nunca erro de protocolo nem crash", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: true, escopo: "conversa" });
  const { status, corpo } = await mcpChamar(t, {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "ferramenta_que_nunca_vai_existir_neste_catalogo" },
  });
  igual(status, 200);
  igual(corpo?.error, undefined, "ferramenta inexistente não deveria virar erro de protocolo");
  verdade(corpo?.result?.isError === true, "deveria vir isError: true");
  verdade(Array.isArray(corpo?.result?.content) && corpo!.result.content[0]?.type === "text", "content malformado");
  verdade(String(corpo?.result?.content?.[0]?.text ?? "").includes("não existe"), "a mensagem não diz que a ferramenta não existe");
});

teste("tools/call sem `name`: erro de PARÂMETROS (protocolo), e não uma tentativa de executar nada", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { status, corpo } = await mcpChamar(t, { jsonrpc: "2.0", id: 9, method: "tools/call", params: {} });
  verdade(status !== 500, `esperava não-500, obtive ${status}`);
  verdade(corpo?.error, "tools/call sem name deveria vir com erro JSON-RPC");
});

// ── 8. protocolo: método desconhecido, corpo inválido, notificação ─────────────────────────────

teste("MUTAÇÃO-ALVO: método JSON-RPC desconhecido → erro JSON-RPC, não 500", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { status, corpo } = await mcpChamar(t, { jsonrpc: "2.0", id: 10, method: "prompts/list" });
  verdade(status !== 500, `esperava não-500, obtive ${status}`);
  verdade(corpo?.error, "método desconhecido deveria vir com campo `error`");
  igual(corpo?.result, undefined, "método desconhecido não deveria ter `result`");
});

teste("corpo que não é JSON → erro JSON-RPC, não 500 (nem exige credencial para ser recusado)", async () => {
  const { status, corpo } = await mcpChamarCru("isto não é json { [ ,,,");
  verdade(status !== 500, `esperava não-500, obtive ${status}`);
  verdade(corpo?.error, "corpo inválido deveria vir com campo `error`");
});

teste("requisição sem `jsonrpc`/`method` válidos → erro JSON-RPC, não 500", async () => {
  const { status, corpo } = await mcpChamarCru(JSON.stringify({ oi: "isto não é uma chamada JSON-RPC" }));
  verdade(status !== 500, `esperava não-500, obtive ${status}`);
  verdade(corpo?.error, "requisição malformada deveria vir com campo `error`");
});

teste("notifications/initialized: NOTIFICAÇÃO, sem resposta (202, corpo vazio) — e sem exigir credencial", async () => {
  const { POST } = await import("@/app/api/agente/mcp/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/agente/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  const res = await POST(req);
  igual(res.status, 202, "notificação deveria ser 202 Accepted");
  const texto = await res.text();
  igual(texto, "", "uma notificação não deveria ter corpo de resposta");
});

// ── 9. COMO_MOSTRAR viaja com o resultado ───────────────────────────────────────────────────────
//
// O caminho de SUCESSO de `tools/call` também chama `registrarUso` (Prisma) antes de responder —
// pelo mesmo motivo do item 6, não é seguro executá-lo de verdade aqui. Provado por leitura: o
// `content` de sucesso embrulha `{ resultado, instrucao: COMO_MOSTRAR }`, e `COMO_MOSTRAR` vem
// IMPORTADO do módulo compartilhado — não é uma string reescrita à mão dentro desta rota (o que
// poderia divergir da frase que a rota REST devolve).

teste("MUTAÇÃO-ALVO: o sucesso de tools/call embrulha `instrucao: COMO_MOSTRAR` junto do resultado", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_MCP, "tratarToolsCall"));
  verdade(corpo.includes("resultadoDeTexto({ resultado, instrucao: COMO_MOSTRAR })"), "o sucesso de tools/call não embrulha { resultado, instrucao: COMO_MOSTRAR }");
});

teste("COMO_MOSTRAR é IMPORTADO do módulo compartilhado, não reescrito na rota MCP", () => {
  verdade(
    /import\s*\{[^}]*\bCOMO_MOSTRAR\b[^}]*\}\s*from\s*["']@\/lib\/agenteFerramentasLiberadas["']/.test(FONTE_MCP),
    "app/api/agente/mcp/route.ts não importa COMO_MOSTRAR de lib/agenteFerramentasLiberadas",
  );
  const semComentarios = codigoDe(FONTE_MCP);
  verdade(!/const\s+COMO_MOSTRAR\s*=/.test(semComentarios), "app/api/agente/mcp/route.ts declara sua PRÓPRIA COMO_MOSTRAR — divergência à espreita");
});

// `resultadoDeTexto` é o helper que gera o `content` de sucesso — conferido separadamente porque
// `corpoDaFuncao` só devolve UMA função por vez, e o texto acima referencia esta.
teste("resultadoDeTexto serializa o dado inteiro (resultado + instrução) dentro de UM content de texto", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_MCP, "resultadoDeTexto"));
  verdade(corpo.length > 10, "corpoDaFuncao não achou resultadoDeTexto");
  verdade(corpo.includes("JSON.stringify(dado)"), "resultadoDeTexto não serializa o dado em JSON dentro do texto");
  verdade(corpo.includes('type: "text"'), 'resultadoDeTexto não usa content: [{ type: "text", ... }]');
});

// ── `dynamic`/`maxDuration`, como a rota REST ───────────────────────────────────────────────────

teste("a rota MCP declara dynamic = force-dynamic e maxDuration = 30, como a rota REST", () => {
  verdade(/export const dynamic\s*=\s*["']force-dynamic["']/.test(FONTE_MCP), "falta `export const dynamic = \"force-dynamic\"`");
  verdade(/export const maxDuration\s*=\s*30\b/.test(FONTE_MCP), "falta `export const maxDuration = 30`");
});

void resumo("agente — servidor MCP (app/api/agente/mcp)");
