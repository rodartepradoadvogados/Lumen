import { NextRequest, NextResponse } from "next/server";
import { lerCredencial, type PermissaoDaPergunta } from "@/lib/agenteCredencial";
import { podeVerNivel, motivoDaRecusa, explicacaoDaRecusa } from "@/lib/nivelFinanceiro";
import { assistantTools, AssistantTool, ToolInput } from "@/lib/assistantTools";
import { registrarUso } from "@/lib/assistenteAuditoria";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ============================================================================
// AS FERRAMENTAS DO LÚMEN AGENT — onde o agente vem buscar dados.
//
// O agente vive noutra máquina e NÃO tem o banco. Quando precisa de um número, ele bate aqui com
// a credencial daquela pergunta (ver lib/agenteCredencial.ts), e o Lúmen responde — só o que
// aquela pessoa, naquele escritório, poderia ver na própria tela.
//
// É ISTO que torna o isolamento real. Não é o bom comportamento do agente que impede um escritório
// de ver o outro: é o fato de a credencial dele só abrir a porta de um escritório. Não existe
// pergunta esperta que contorne isso, porque a decisão não passa pelo agente.
//
// O FINANCEIRO É REGRA DURA. Dentro do mesmo escritório, só responde a quem tem acesso ao
// financeiro (administrador ou `financeAccess`). A checagem acontece DUAS vezes de propósito: a
// ferramenta financeira não entra na lista oferecida, e ainda assim é barrada de novo na execução.
// Não é paranoia: a primeira lista é conveniência, a segunda é a regra. Se um dia alguém mexer na
// primeira sem pensar, a segunda continua de pé.
//
// SÓ LEITURA. Nenhuma ferramenta daqui escreve, cria ou apaga nada — decisão do dono, e o desenho
// a respeita: `assistantTools` são todas de consulta.
// ============================================================================

// ── A PAREDE POR ESCOPO (peticionamento) ────────────────────────────────────────────────────
//
// UMA MINUTA NÃO PRECISA DO ESCRITÓRIO INTEIRO. O agente de peticionamento recebe uma credencial
// de vida longa (até 900s+ — ver EscopoDaCredencial e lib/hermesPonte.ts:TETO_DA_PONTE_S) porque
// uma geração pode legitimamente demorar; e é exatamente por ela viver tanto que o que ela
// alcança tem de ser o MÍNIMO que redigir uma peça exige, não o catálogo inteiro do chat.
//
// LISTA BRANCA, NUNCA NEGRA. Uma ferramenta nova nasce FORA do peticionamento por padrão — quem
// criar a próxima ferramenta do escritório não precisa lembrar de excluí-la daqui; precisa decidir
// INCLUI-LA, e essa decisão é o preço de dar a uma minuta acesso a algo novo. O esquecimento
// custa um chamado de suporte ("por que a minuta não vê X"), nunca um vazamento — o MESMO
// princípio que este arquivo já aplica ao financeiro ausente (ver `liberada`, abaixo).
//
// AS SETE, e por que cada módulo de fora ficou de fora:
//
//   consultar_perfil_do_escritorio  — quem é o escritório, útil para o cabeçalho/qualificação da peça.
//   consultar_processos             — os processos vinculados à sessão, insumo direto de fatos.
//   consultar_atendimento           — o atendimento de origem, mesmo motivo.
//   buscar_cliente                  — identificar/qualificar a parte.
//   consultar_historico_cliente     — histórico do cliente (a régua financeira interna dele
//                                     continua valendo — ver lib/nivelFinanceiro.ts).
//   consultar_documentos            — os documentos do vínculo, para citar o que já existe no caso.
//   consultar_assessorias           — contexto de assessoria continuada, quando a peça nasce dali.
//
//   financeiro, indicadores   — FORA: dinheiro não é insumo de peça. Uma minuta não cobra nem
//                               presta contas; se algum dia precisar citar valor de causa, ele já
//                               vem do questionário, não de uma consulta ao caixa do escritório.
//   equipe, agenda, tarefas,
//   pendências, publicações  — FORA: não são insumo de REDAÇÃO — são gestão interna do escritório
//                               (quem trabalha, quando, o que falta fazer, o que chegou por
//                               publicação). Se um dia uma dessas entrar como insumo de peça,
//                               entra por DECISÃO — mexendo nesta lista — nunca por esquecimento.
const FERRAMENTAS_DO_PETICIONAMENTO: ReadonlySet<string> = new Set([
  "consultar_perfil_do_escritorio",
  "consultar_processos",
  "consultar_atendimento",
  "buscar_cliente",
  "consultar_historico_cliente",
  "consultar_documentos",
  "consultar_assessorias",
]);

const COMO_MOSTRAR =
  "Cada item traz um campo `link` para a tela do Lúmen. Ao citar um item, escreva-o como link " +
  "markdown — [número do processo](/processos/abc123) — para a pessoa clicar e ir direto. Nunca " +
  "invente um link: use exatamente o que veio no campo `link`.";

function semAutorizacao(motivo: string) {
  return NextResponse.json({ erro: motivo }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const cabecalho = request.headers.get("authorization") || "";
  if (!cabecalho.startsWith("Bearer ")) {
    return semAutorizacao("Credencial ausente.");
  }

  const permissao = await lerCredencial(cabecalho.slice(7).trim());
  if (!permissao) {
    // Não se distingue "expirada" de "inválida" na resposta: quem está do outro lado não precisa
    // saber qual dos dois, e a diferença só ajudaria quem estivesse tentando adivinhar.
    return semAutorizacao("Credencial inválida ou expirada.");
  }

  let corpo: { ferramenta?: string; entrada?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const nome = typeof corpo.ferramenta === "string" ? corpo.ferramenta.trim() : "";
  if (!nome) {
    return NextResponse.json(
      { erro: "Informe a ferramenta.", disponiveis: nomesDisponiveis(permissao) },
      { status: 400 },
    );
  }

  const ferramenta = assistantTools.find((t) => t.spec.name === nome);
  if (!ferramenta) {
    return NextResponse.json(
      { erro: `Ferramenta "${nome}" não existe.`, disponiveis: nomesDisponiveis(permissao) },
      { status: 404 },
    );
  }

  // A REGRA INEXORÁVEL, aplicada aqui e não antes: mesmo que o agente peça, mesmo que a pergunta
  // seja habilidosa, sem acesso ao financeiro não sai número de financeiro. E dentro do
  // financeiro, sem ser sócio não sai INDICADOR — faturamento, lucro, margem, projeção.
  //
  // O nível ausente é tratado como "indicador", o mais restrito. Uma ferramenta nova do
  // financeiro que alguém esqueça de classificar nasce fechada, e não aberta: o esquecimento
  // custa um chamado de suporte, e não um vazamento.
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
      // os dois em silêncio.
      detalhe: `recusada: ${motivoDaRecusa(nivel, permissao) ?? "sem permissão"}`,
    });
    return NextResponse.json({ erro: explicacaoDaRecusa(nivel, permissao) }, { status: 403 });
  }

  const entrada: ToolInput =
    corpo.entrada && typeof corpo.entrada === "object" ? (corpo.entrada as ToolInput) : {};

  try {
    const resultado = await ferramenta.executar(entrada, {
      userId: permissao.userId,
      officeId: permissao.officeId,
      // A MESMA dupla que decidiu se esta ferramenta foi oferecida (`liberada`, acima) chega até
      // quem a executa — é o que permite a uma ferramenta que NÃO é do financeiro (o histórico do
      // cliente, as assessorias) decidir, por dentro, se mostra ou omite o bloco de dinheiro que
      // carrega. Ver AssistantTool.executar em lib/assistantTools.ts.
      financeiro: permissao.financeiro,
      admin: permissao.admin,
    });

    // O rastro de PROCEDÊNCIA: é esta linha que responde "de onde veio esse número" quando alguém
    // perguntar meses depois. Sem ela, a auditoria diria que houve uma conversa e não diria o que
    // foi consultado por baixo.
    await registrarUso({
      officeId: permissao.officeId,
      userId: permissao.userId,
      sessionId: permissao.sessionId ?? null,
      acao: "FERRAMENTA",
      ferramenta: nome,
      detalhe: JSON.stringify(entrada),
    });

    // A INSTRUÇÃO VIAJA COM O DADO, e não só no prompt do perfil. Um prompt mora na máquina do
    // agente e pode ser reescrito, esquecido ou trocado quando o perfil for recriado; isto chega
    // junto de cada consulta, e por isso não se perde. É o que faz o agente devolver um processo
    // clicável em vez de um número para o advogado copiar e procurar na busca.
    return NextResponse.json({ resultado, instrucao: COMO_MOSTRAR });
  } catch (erro) {
    console.error(`[agente/ferramentas] falha em ${nome}:`, mensagemDeErro(erro));
    return NextResponse.json({ erro: "Não foi possível consultar agora." }, { status: 502 });
  }
}

/**
 * Esta pessoa pode usar esta ferramenta?
 *
 * UMA função, usada pelos TRÊS lugares que decidem: a execução, a lista de erro e o catálogo. Uma
 * trava que só existe num deles não é uma trava — e o catálogo é o mais fácil de esquecer,
 * porque ele não "executa" nada. Mas um catálogo que anuncia `consultar_indicadores` a quem não é
 * sócio já contou metade: diz que existe um número de margem, e convida a tentar.
 */
function liberada(ferramenta: AssistantTool, permissao: PermissaoDaPergunta): boolean {
  // A PAREDE DO ESCOPO PRIMEIRO. Uma credencial de peticionamento só alcança a lista branca —
  // nunca "a lista branca, ou o financeiro se a pessoa tiver acesso": as duas travas são
  // independentes e NENHUMA substitui a outra (ver o cabeçalho desta seção). Escopo "conversa"
  // atravessa esta linha sem restrição — é o comportamento de sempre, provado pela suíte.
  if (permissao.escopo === "peticionamento" && !FERRAMENTAS_DO_PETICIONAMENTO.has(ferramenta.spec.name)) {
    return false;
  }
  // A REGRA DO FINANCEIRO, DEPOIS — e vale para os dois escopos: uma ferramenta financeira que por
  // engano entrasse na lista branca acima ainda seria barrada aqui, para quem não tem acesso ao
  // financeiro do escritório. Defesa em duas camadas, não uma.
  if (ferramenta.modulo !== "financeiro") return true;
  return podeVerNivel(ferramenta.nivel ?? "indicador", permissao);
}

// A lista do que este pedido pode usar. Serve ao agente para se orientar — e serve a quem lê um
// erro, para entender por que a ferramenta pedida não estava ali.
function nomesDisponiveis(permissao: PermissaoDaPergunta): string[] {
  return assistantTools.filter((t: AssistantTool) => liberada(t, permissao)).map((t) => t.spec.name);
}

/** O catálogo, para o agente descobrir o que pode perguntar. Mesma credencial, mesma regra. */
export async function GET(request: NextRequest) {
  const cabecalho = request.headers.get("authorization") || "";
  if (!cabecalho.startsWith("Bearer ")) return semAutorizacao("Credencial ausente.");

  const permissao = await lerCredencial(cabecalho.slice(7).trim());
  if (!permissao) return semAutorizacao("Credencial inválida ou expirada.");

  return NextResponse.json({
    ferramentas: assistantTools
      .filter((t) => liberada(t, permissao))
      .map((t) => ({
        nome: t.spec.name,
        modulo: t.modulo,
        descricao: t.spec.description,
        entrada: t.spec.input_schema,
      })),
    comoMostrar: COMO_MOSTRAR,
  });
}
