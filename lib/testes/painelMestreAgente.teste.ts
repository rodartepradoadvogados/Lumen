import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { alcancaNivel, motivoNivelInsuficiente } from "@/lib/painelMestreVisibilidade";
import {
  painelMestreFerramentas,
  ferramentaLiberada,
  quemPerguntaDaPlataforma,
  explicacaoDaRecusaDaFerramenta,
  type PainelMestreTool,
} from "@/lib/painelMestreFerramentas";
import { orcamentoDoPedido, LIMITE_DO_PEDIDO_PAINEL_MESTRE, type TurnoDoPainelMestre } from "@/lib/painelMestreOrcamento";
import { maskReadResult } from "@/lib/supportMaskingApply";
import type { PlatformViewer } from "@/lib/platformMember";

// ============================================================================
// F7 — O AGENTE DO PAINEL MESTRE, VARRIDO CONTRA AS TRÊS LEIS QUE ELE NÃO PODE VIOLAR.
//
//   LEI 1 — HERDA A CREDENCIAL DE QUEM PERGUNTOU (a escada ABERTO < VIDRO_FOSCO < QUEBRA_VIDRO,
//           e a régua financeira REGISTRO/INDICADOR via PlatformRole.canManageBilling).
//   LEI 2 — NÃO ENXERGA ATRAVÉS DE UMA SESSÃO DE VIDRO-FOSCO ABERTA.
//   LEI 3 — SÓ LEITURA.
//
// Mesmo par de armadilhas de sempre (lib/testes/executar.ts): `codigoDe` antes de procurar
// qualquer coisa, `corpoDaFuncao` para isolar UMA função em vez de `includes` no arquivo inteiro.
// ============================================================================

const RAIZ = process.cwd();
const FONTE_FERRAMENTAS = readFileSync(join(RAIZ, "lib", "painelMestreFerramentas.ts"), "utf8");
const FONTE_ROTA = readFileSync(join(RAIZ, "app", "api", "painel-mestre", "agente", "route.ts"), "utf8");

const VERBOS_DE_ESCRITA = [".create(", ".update(", ".upsert(", ".delete(", ".deleteMany(", ".updateMany(", ".createMany(", "$executeRaw"];

function viewer(parcial: Partial<PlatformViewer>): PlatformViewer {
  return {
    id: "membro-1",
    name: "Alguém da Lúmen",
    email: "alguem@lumen.example",
    roleKey: "SUPORTE_N1",
    maxVisibility: "ABERTO",
    canManageBilling: false,
    canManageMembers: false,
    canApproveAccess: false,
    ...parcial,
  };
}

// ── LEI 3: SÓ LEITURA ────────────────────────────────────────────────────────────────────────

teste("lib/painelMestreFerramentas.ts inteiro não chama nenhum verbo de escrita do Prisma", () => {
  const semComentarios = codigoDe(FONTE_FERRAMENTAS);
  for (const verbo of VERBOS_DE_ESCRITA) {
    verdade(!semComentarios.includes(verbo), `lib/painelMestreFerramentas.ts contém "${verbo}"`);
  }
});

teste("a rota do agente do Painel Mestre nem sequer importa o Prisma — toda leitura passa pelas ferramentas", () => {
  // A rota chama `client.messages.create(...)` (SDK da Anthropic) — um `.create(` cru bateria
  // nisso por engano. A prova certa aqui não é "não contém o verbo", é "não tem Prisma nenhum
  // para escrever com": a rota só resolve o viewer (lib/currentUser, lib/platformMember) e
  // delega toda consulta às ferramentas de lib/painelMestreFerramentas.ts, já varridas acima.
  const semComentarios = codigoDe(FONTE_ROTA);
  verdade(!semComentarios.includes('from "@/lib/prisma"'), "a rota importa lib/prisma diretamente");
  verdade(!/\bprisma\s*\./.test(semComentarios), "a rota chama `prisma.` diretamente");
});

teste("nenhuma ferramenta do F7 usa prismaBase (o client SEM a máscara de Vidro Fosco)", () => {
  // prismaBase é EXCLUSIVO de lib/breakGlass.ts (ver o comentário de lib/prisma.ts) — se este
  // arquivo um dia importar prismaBase, alguma ferramenta passou a ler dado cru por fora da
  // extensão que aplica o mascaramento, e a Lei 2 furou pela raiz.
  verdade(!codigoDe(FONTE_FERRAMENTAS).includes("prismaBase"), "lib/painelMestreFerramentas.ts importa ou usa prismaBase");
});

// ── LEI 1: HERDA A CREDENCIAL — a escada de visibilidade ────────────────────────────────────────

teste("a escada de visibilidade é estritamente crescente: ABERTO < VIDRO_FOSCO < QUEBRA_VIDRO < COFRE", () => {
  igual(alcancaNivel("ABERTO", "ABERTO"), true);
  igual(alcancaNivel("ABERTO", "VIDRO_FOSCO"), false);
  igual(alcancaNivel("ABERTO", "QUEBRA_VIDRO"), false);
  igual(alcancaNivel("ABERTO", "COFRE"), false);

  igual(alcancaNivel("VIDRO_FOSCO", "ABERTO"), true);
  igual(alcancaNivel("VIDRO_FOSCO", "VIDRO_FOSCO"), true);
  igual(alcancaNivel("VIDRO_FOSCO", "QUEBRA_VIDRO"), false);

  igual(alcancaNivel("QUEBRA_VIDRO", "VIDRO_FOSCO"), true);
  igual(alcancaNivel("QUEBRA_VIDRO", "QUEBRA_VIDRO"), true);
  // "Ninguém alcança COFRE — nem sócio": nem o teto mais alto que qualquer PlatformRole hoje
  // recebe (QUEBRA_VIDRO) chega lá.
  igual(alcancaNivel("QUEBRA_VIDRO", "COFRE"), false);
});

teste("um maxVisibility desconhecido, nulo ou vazio nunca alcança nível nenhum (fail-closed)", () => {
  igual(alcancaNivel(null, "ABERTO"), false);
  igual(alcancaNivel(undefined, "ABERTO"), false);
  igual(alcancaNivel("", "ABERTO"), false);
  igual(alcancaNivel("PAPEL_QUE_NAO_EXISTE", "ABERTO"), false);
});

teste("motivoNivelInsuficiente nunca devolve string vazia", () => {
  verdade(motivoNivelInsuficiente("ABERTO").length > 0, "motivo vazio para ABERTO");
  verdade(motivoNivelInsuficiente("VIDRO_FOSCO").length > 0, "motivo vazio para VIDRO_FOSCO");
  verdade(motivoNivelInsuficiente("QUEBRA_VIDRO").length > 0, "motivo vazio para QUEBRA_VIDRO");
});

// ── LEI 1: NENHUMA FERRAMENTA EXIGE COFRE ────────────────────────────────────────────────────

teste("nenhuma ferramenta do agente exige o nível COFRE — a porta mais alta não tem chat que a abra", () => {
  for (const tool of painelMestreFerramentas) {
    verdade((tool.nivelVisibilidade as string) !== "COFRE", `${tool.spec.name} exige COFRE`);
  }
});

// ── LEI 1: ferramentaLiberada respeita a escada, para TODAS as ferramentas registradas ──────────

teste("um papel ABERTO só recebe as ferramentas ABERTO — nunca a que exige VIDRO_FOSCO", () => {
  const v = viewer({ maxVisibility: "ABERTO" });
  // As ferramentas com `nivel` (registro/indicador) somam uma SEGUNDA trava, própria da régua
  // financeira — testada à parte, mais abaixo. Aqui só a trava da ESCADA de visibilidade importa,
  // por isso o loop olha só para as ferramentas sem `nivel`.
  for (const tool of painelMestreFerramentas.filter((t) => !t.nivel)) {
    const deveriaLiberar = tool.nivelVisibilidade === "ABERTO";
    igual(ferramentaLiberada(tool, v), deveriaLiberar, `${tool.spec.name}: `);
  }
});

teste("um papel VIDRO_FOSCO recebe também a ferramenta que olha para dentro de um escritório", () => {
  const v = viewer({ maxVisibility: "VIDRO_FOSCO" });
  const alvo = painelMestreFerramentas.find((t) => t.spec.name === "consultar_atividade_do_escritorio");
  verdade(!!alvo, "consultar_atividade_do_escritorio não está registrada");
  igual(ferramentaLiberada(alvo as PainelMestreTool, v), true);
});

teste("consultar_atividade_do_escritorio está registrada com nivelVisibilidade VIDRO_FOSCO", () => {
  const alvo = painelMestreFerramentas.find((t) => t.spec.name === "consultar_atividade_do_escritorio");
  igual(alvo?.nivelVisibilidade, "VIDRO_FOSCO");
});

// ── LEI 1: a régua financeira da PLATAFORMA (Q15, equivalente canManageBilling) ─────────────────

teste("quemPerguntaDaPlataforma: financeiro é sempre true, admin segue canManageBilling", () => {
  igual(quemPerguntaDaPlataforma(viewer({ canManageBilling: false })), { financeiro: true, admin: false });
  igual(quemPerguntaDaPlataforma(viewer({ canManageBilling: true })), { financeiro: true, admin: true });
});

teste("consultar_cobranca_dos_escritorios (REGISTRO) é liberada a qualquer membro ativo, sem canManageBilling", () => {
  const tool = painelMestreFerramentas.find((t) => t.spec.name === "consultar_cobranca_dos_escritorios");
  verdade(!!tool, "consultar_cobranca_dos_escritorios não está registrada");
  igual(ferramentaLiberada(tool as PainelMestreTool, viewer({ maxVisibility: "ABERTO", canManageBilling: false })), true);
});

teste("consultar_indicadores_da_plataforma (INDICADOR) exige canManageBilling — mesmo com maxVisibility alto", () => {
  const tool = painelMestreFerramentas.find((t) => t.spec.name === "consultar_indicadores_da_plataforma");
  verdade(!!tool, "consultar_indicadores_da_plataforma não está registrada");
  // Nível de visibilidade alto (QUEBRA_VIDRO) NÃO substitui a régua financeira: são duas
  // travas independentes, e um sócio-de-fato sem canManageBilling continua barrado.
  igual(ferramentaLiberada(tool as PainelMestreTool, viewer({ maxVisibility: "QUEBRA_VIDRO", canManageBilling: false })), false);
  igual(ferramentaLiberada(tool as PainelMestreTool, viewer({ maxVisibility: "ABERTO", canManageBilling: true })), true);
});

teste("explicacaoDaRecusaDaFerramenta nunca devolve string vazia para uma ferramenta barrada", () => {
  const tool = painelMestreFerramentas.find((t) => t.spec.name === "consultar_atividade_do_escritorio") as PainelMestreTool;
  const texto = explicacaoDaRecusaDaFerramenta(tool, viewer({ maxVisibility: "ABERTO" }));
  verdade(texto.length > 0, "explicação vazia");
});

// ── LEI 2: NÃO ENXERGA ATRAVÉS DE UMA SESSÃO DE VIDRO-FOSCO ABERTA ──────────────────────────────
//
// consultar_atividade_do_escritorio é a ÚNICA ferramenta que olha para dentro de um escritório.
// Duas provas, uma comportamental (o motor de máscara de verdade, sem precisar de banco — DMMF
// já vem do @prisma/client gerado) e uma estrutural (a função de verdade CHAMA esse motor e a
// checagem de sessão ativa — nenhuma das duas foi removida por engano).

teste("Lei 2 (comportamental): maskReadResult redige o título do processo, mesmo vindo de dentro de uma sessão de suporte", () => {
  const tituloOriginal = "Ação de cobrança contra Fulano de Tal";
  // maskReadResult MUTA IN PLACE (ver o comentário do próprio arquivo) — guarda o título ANTES
  // de chamar, senão comparar `mascarado.title !== bruto.title` compara o mesmo objeto consigo
  // mesmo depois de mutado, e o teste passaria verde sem nunca ter provado nada.
  const bruto = [{ id: "case-1", title: tituloOriginal, status: "ATIVO", updatedAt: new Date("2026-09-01") }];
  const mascarado = maskReadResult("Case", bruto) as typeof bruto;

  verdade(mascarado[0].title !== tituloOriginal, "o título não foi mascarado — a Lei 2 furou");
  verdade(/^\[conteúdo protegido — \d+ caracteres?\]$/.test(mascarado[0].title), `título mascarado em formato inesperado: "${mascarado[0].title}"`);
  // O que o suporte PRECISA para diagnosticar continua visível: id, status e data.
  igual(mascarado[0].id, "case-1");
  igual(mascarado[0].status, "ATIVO");
});

teste("Lei 2 (estrutural): executarConsultarAtividadeDoEscritorio chama maskReadResult(\"Case\", ...) sobre os processos recentes antes de devolver", () => {
  const corpo = corpoDaFuncao(FONTE_FERRAMENTAS, "executarConsultarAtividadeDoEscritorio");
  verdade(corpo.length > 300, "corpoDaFuncao não achou executarConsultarAtividadeDoEscritorio");
  verdade(corpo.includes('maskReadResult("Case",'), "a função não chama maskReadResult(\"Case\", ...) — o título sairia sem máscara");
  // A variável mascarada (e não a crua) é o que vira `processosRecentes` na resposta.
  const depoisDaMascara = corpo.slice(corpo.indexOf('maskReadResult("Case",'));
  verdade(depoisDaMascara.includes("casosMascarados.map"), "a resposta não usa o resultado MASCARADO — pode estar devolvendo casosRecentes cru");
});

teste("Lei 2 (Lei 1 no mesmo lugar): a mesma função exige sessão de suporte ATIVA para aquele escritório antes de consultar qualquer coisa", () => {
  const corpo = corpoDaFuncao(FONTE_FERRAMENTAS, "executarConsultarAtividadeDoEscritorio");
  verdade(corpo.includes("getActiveSupportSession(office.id)"), "a função não confere sessão de suporte ativa — responderia sobre um escritório sem ninguém ter aberto acesso a ele");
  // A checagem de sessão precisa vir ANTES de qualquer prisma.case.count/findMany sobre aquele
  // escritório — senão o dado já foi lido antes da recusa decidir alguma coisa.
  const indiceSessao = corpo.indexOf("getActiveSupportSession(office.id)");
  const indicePrimeiraConsulta = corpo.indexOf("prisma.case.count(");
  verdade(indiceSessao >= 0 && indicePrimeiraConsulta >= 0 && indiceSessao < indicePrimeiraConsulta, "a consulta ao processo roda antes de confirmar a sessão de suporte");
});

teste("Lei 1 (defesa em profundidade): executarConsultarAtividadeDoEscritorio confere alcancaNivel de novo, por dentro", () => {
  const corpo = corpoDaFuncao(FONTE_FERRAMENTAS, "executarConsultarAtividadeDoEscritorio");
  verdade(corpo.includes('alcancaNivel(viewer.maxVisibility, "VIDRO_FOSCO")'), "a função não confere o nível por dentro — depende só do filtro externo");
});

// ── O ORÇAMENTO DO PEDIDO (mesma disciplina de lib/agenteAtendimento.ts) ────────────────────────

function turno(texto: string): TurnoDoPainelMestre {
  return { role: "user", texto };
}

teste("orcamentoDoPedido: sem estouro, o histórico inteiro passa intacto", () => {
  const historico = [turno("um"), turno("dois"), turno("três")];
  const r = orcamentoDoPedido({ textoFixo: "regras fixas", historico, pergunta: "e agora?" });
  verdade(r.cabe, "deveria caber");
  if (r.cabe) igual(r.historico, historico);
});

teste("orcamentoDoPedido: corta o histórico do MAIS ANTIGO para o mais novo — o turno recente sobrevive, o antigo some", () => {
  // Cada turno ocupa ~1/3 do orçamento real (mais a folga de 10 que a função soma por turno) —
  // três deles não cabem juntos com o texto fixo, então pelo menos o mais antigo tem de cair, e
  // o mais recente tem de sobreviver. Calibrado sobre a CONSTANTE DE VERDADE
  // (LIMITE_DO_PEDIDO_PAINEL_MESTRE), não sobre um teto inventado pelo teste — se a constante
  // mudar, o teste continua válido.
  const tamanhoDoTurno = Math.floor(LIMITE_DO_PEDIDO_PAINEL_MESTRE / 3);
  const antigo = turno("A".repeat(tamanhoDoTurno));
  const meio = turno("B".repeat(tamanhoDoTurno));
  const recente = turno("C".repeat(tamanhoDoTurno));

  const r = orcamentoDoPedido({ textoFixo: "regras fixas", historico: [antigo, meio, recente], pergunta: "e agora?" });
  verdade(r.cabe, "deveria caber depois de cortar pelo menos o mais antigo");
  if (r.cabe) {
    verdade(r.historico.length < 3, "nada foi cortado — os três turnos, quase do tamanho do limite cada, passaram inteiros");
    verdade(!r.historico.includes(antigo), "o turno MAIS ANTIGO sobreviveu ao corte — deveria ter sido o primeiro a cair");
    verdade(r.historico.includes(recente), "o turno MAIS RECENTE não sobreviveu ao corte — deveria ser o último a cair");
  }
});

teste("orcamentoDoPedido: histórico grande o bastante para estourar o limite real é cortado, e o mais recente sobrevive", () => {
  const historico: TurnoDoPainelMestre[] = [];
  for (let i = 0; i < 50; i++) historico.push(turno(`turno número ${i} — ${"z".repeat(2000)}`));
  const r = orcamentoDoPedido({ textoFixo: "regras", historico, pergunta: "pergunta atual" });
  verdade(r.cabe, "deveria caber depois de cortar");
  if (r.cabe) {
    verdade(r.historico.length < historico.length, "nada foi cortado — histórico gigante passou inteiro");
    verdade(r.historico.length > 0, "cortou o histórico inteiro quando não precisava");
    igual(r.historico[r.historico.length - 1], historico[historico.length - 1], "o turno mais recente não sobreviveu ao corte");
  }
});

teste("orcamentoDoPedido: NUNCA corta o texto fixo nem a pergunta de agora — se só os dois já estouram, recusa falada", () => {
  const gigante = "a".repeat(200_000);
  const r = orcamentoDoPedido({ textoFixo: gigante, historico: [turno("qualquer coisa")], pergunta: "oi" });
  igual(r.cabe, false);
  if (!r.cabe) verdade(r.motivo.length > 0, "recusa sem motivo falado");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA SUPERVISÃO — A ROTA NÃO TINHA TESTE NENHUM.
//
// As travas acima cobrem os módulos puros, e cobrem bem. Mas a ROTA é a única porta: é nela que
// a Lei 1 ("herda a credencial de quem perguntou") de fato aterrissa. Oito mutações aplicadas
// direto no arquivo da rota passaram VERDES na primeira revisão — inclusive a primeira desta
// lista, que apaga a autenticação inteira e deixa qualquer visitante conversar com um agente que
// lê dado de escritório. O código estava certo; nada o segurava.
//
// Varredura, e não execução, pelo motivo de sempre nesta casa: rodar a rota exigiria sessão
// autenticada e a API da Anthropic. Ancorada por regex e por corpoDaFuncao, com `codigoDe` para
// um comentário que CITA a trava não fingir que ela existe no código.
// ══════════════════════════════════════════════════════════════════════════════════════════

const FONTE_DA_ROTA = readFileSync(join(process.cwd(), "app", "api", "painel-mestre", "agente", "route.ts"), "utf8");
const CODIGO_DA_ROTA = codigoDe(FONTE_DA_ROTA);

teste("TRAVA: a rota recusa quem não é da equipe da Lúmen, ANTES de ler o corpo do pedido", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  verdade(corpo.length > 400, `corpoDaFuncao("POST") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/const viewer = await resolveViewer\(\);/.test(corpo), "a rota deixou de resolver quem está perguntando");
  verdade(/if \(!viewer\)[\s\S]{0,120}status: 401/.test(corpo),
    "sumiu a recusa de quem não está autenticado — qualquer visitante conversaria com o agente");
  const posTrava = corpo.indexOf("if (!viewer)");
  const posCorpo = corpo.indexOf("request.json()");
  verdade(posTrava >= 0 && posCorpo >= 0 && posTrava < posCorpo, "a autenticação precisa vir antes de ler o corpo do pedido");
});

teste("TRAVA: a chave ausente barra a conversa — nunca segue sem configuração", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  verdade(/if \(!isAssistantConfigured\(\)\)/.test(corpo), "a rota deixou de conferir se o assistente está configurado");
});

teste("HARD GATE: nem o dono da plataforma alcança COFRE — o schema é literal nisso", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "resolveViewer");
  verdade(corpo.length > 120, `corpoDaFuncao("resolveViewer") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/maxVisibility: "QUEBRA_VIDRO"/.test(corpo), "o teto sintetizado para o dono da plataforma mudou");
  verdade(!/COFRE/.test(corpo), "alguém deu COFRE a alguém — nem sócio alcança, e o dono não é exceção");
});

teste("TRAVA: o histórico vindo do navegador só aceita os dois papéis de conversa", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  // Sem isto, um `role` qualquer (ex.: "system") vindo do cliente entraria no pedido como se
  // fosse instrução — a superfície clássica de injeção por histórico forjado.
  verdade(/role === "user" \|\| turno!\.role === "assistant"/.test(corpo),
    "o filtro de papéis do histórico caiu — o cliente passa a escolher o papel de cada turno");
  verdade(/\.slice\(-40\)/.test(corpo), "sumiu o teto bruto do histórico — o cliente manda o tamanho que quiser");
});

teste("TRAVA: o veredito do orçamento INTERROMPE o pedido, não é só calculado", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  verdade(/if \(!orcamento\.cabe\)[\s\S]{0,120}status: 400/.test(corpo),
    "o orçamento virou enfeite — o pedido seguiria acima do teto, que foi o defeito que derrubou a Ana em produção");
});

teste("LEI 1: a lista de ferramentas oferecida ao modelo é filtrada pelo teto de quem pergunta", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  verdade(/painelMestreFerramentas\.filter\(\(tool\) => ferramentaLiberada\(tool, viewer\)\)/.test(corpo),
    "a rota passou a oferecer TODAS as ferramentas ao modelo, sem filtrar pelo papel");
});

teste("LEI 1: ferramenta fora da lista oferecida NUNCA é executada — recusa por escrito", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  verdade(/const tool = ferramentasPorNome\.get\(toolUse\.name\);/.test(corpo), "sumiu a resolução da ferramenta pela lista liberada");
  verdade(/tool\s*\?\s*await tool\.executar\(entrada, viewer\)\s*:/.test(corpo),
    "a execução deixou de ser condicionada à ferramenta estar liberada para este papel");
  verdade(!/painelMestreFerramentas\.find\(/.test(corpo),
    "a rota voltou a procurar a ferramenta na lista COMPLETA — o filtro por papel deixa de valer");
});

teste("TRAVA: nenhum caminho do laço gira sem teto — cada volta é uma chamada paga", () => {
  const corpo = corpoDaFuncao(CODIGO_DA_ROTA, "POST");
  const pos = corpo.indexOf('stop_reason === "pause_turn"');
  verdade(pos >= 0, "sumiu o tratamento de pause_turn");
  const trecho = corpo.slice(pos, pos + 420);
  // O DEFEITO ORIGINAL: `pause_turn` fazia `continue` sem tocar no contador, e uma sequência
  // delas girava o laço até a Vercel matar a função aos 60s — gastando a cada volta.
  verdade(/rounds \+= 1/.test(trecho), "a volta de pause_turn não conta rodada — laço sem teto num caminho que gasta dinheiro");
  verdade(/rounds > MAX_TOOL_ROUNDS/.test(trecho), "a volta de pause_turn não tem saída pelo teto de rodadas");
  const posContinue = trecho.indexOf("continue");
  const posIncremento = trecho.indexOf("rounds += 1");
  verdade(posIncremento >= 0 && posIncremento < posContinue, "o contador precisa subir ANTES do continue");
});

teste("LEI 3: a rota inteira é de leitura — nenhuma escrita no banco em caminho nenhum", () => {
  verdade(!/prisma\.\w+\.(create|update|upsert|delete|updateMany|deleteMany|createMany)\(/.test(CODIGO_DA_ROTA),
    "apareceu escrita no banco dentro da rota do agente — ele é só leitura, sem exceção");
});

void resumo("F7 — o agente do Painel Mestre");
