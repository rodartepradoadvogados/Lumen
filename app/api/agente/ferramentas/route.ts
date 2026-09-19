import { NextRequest, NextResponse } from "next/server";
import { lerCredencial } from "@/lib/agenteCredencial";
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
      { erro: "Informe a ferramenta.", disponiveis: nomesDisponiveis(permissao.financeiro) },
      { status: 400 },
    );
  }

  const ferramenta = assistantTools.find((t) => t.spec.name === nome);
  if (!ferramenta) {
    return NextResponse.json(
      { erro: `Ferramenta "${nome}" não existe.`, disponiveis: nomesDisponiveis(permissao.financeiro) },
      { status: 404 },
    );
  }

  // A REGRA INEXORÁVEL, aplicada aqui e não antes: mesmo que o agente peça, mesmo que a pergunta
  // seja habilidosa, sem acesso ao financeiro não sai número de financeiro.
  if (ferramenta.modulo === "financeiro" && !permissao.financeiro) {
    await registrarUso({
      officeId: permissao.officeId,
      userId: permissao.userId,
      sessionId: permissao.sessionId ?? null,
      acao: "FERRAMENTA",
      ferramenta: nome,
      detalhe: "recusada: usuário sem acesso ao financeiro",
    });
    return NextResponse.json(
      { erro: "Esta pessoa não tem acesso ao financeiro do escritório." },
      { status: 403 },
    );
  }

  const entrada: ToolInput =
    corpo.entrada && typeof corpo.entrada === "object" ? (corpo.entrada as ToolInput) : {};

  try {
    const resultado = await ferramenta.executar(entrada, {
      userId: permissao.userId,
      officeId: permissao.officeId,
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

    return NextResponse.json({ resultado });
  } catch (erro) {
    console.error(`[agente/ferramentas] falha em ${nome}:`, mensagemDeErro(erro));
    return NextResponse.json({ erro: "Não foi possível consultar agora." }, { status: 502 });
  }
}

// A lista do que este pedido pode usar. Serve ao agente para se orientar — e serve a quem lê um
// erro, para entender por que a ferramenta pedida não estava ali.
function nomesDisponiveis(financeiro: boolean): string[] {
  return assistantTools
    .filter((t: AssistantTool) => t.modulo !== "financeiro" || financeiro)
    .map((t) => t.spec.name);
}

/** O catálogo, para o agente descobrir o que pode perguntar. Mesma credencial, mesma regra. */
export async function GET(request: NextRequest) {
  const cabecalho = request.headers.get("authorization") || "";
  if (!cabecalho.startsWith("Bearer ")) return semAutorizacao("Credencial ausente.");

  const permissao = await lerCredencial(cabecalho.slice(7).trim());
  if (!permissao) return semAutorizacao("Credencial inválida ou expirada.");

  return NextResponse.json({
    ferramentas: assistantTools
      .filter((t) => t.modulo !== "financeiro" || permissao.financeiro)
      .map((t) => ({
        nome: t.spec.name,
        modulo: t.modulo,
        descricao: t.spec.description,
        entrada: t.spec.input_schema,
      })),
  });
}
