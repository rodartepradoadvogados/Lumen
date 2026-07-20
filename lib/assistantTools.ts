import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// ============================================================================
// Ferramentas do Assistente Claude (chat interno)
//
// Cada ferramenta pertence a um "módulo". O endpoint (app/api/assistente/route.ts)
// só oferece ao modelo as ferramentas cujo módulo o usuário logado tem permissão
// de acessar. Mesmo assim, cada `executar` abaixo NÃO confia nisso — quem chama
// este arquivo deve filtrar antes, mas o módulo "financeiro" é sensível o
// suficiente para merecer dupla checagem também aqui (ver `route.ts`).
//
// Todas as consultas usam Prisma diretamente contra o banco real: o assistente
// nunca deve inventar números, processos ou valores — só repete o que estas
// funções efetivamente retornam.
// ============================================================================

export type AssistantToolModule =
  | "processos"
  | "publicacoes"
  | "agenda"
  | "atendimento"
  | "clientes"
  | "financeiro";

// Entrada bruta de um tool_use — vem de fora (o modelo), então nunca é tipada
// como a interface "ideal" da ferramenta; cada `executar` lê os campos que
// precisa com os helpers abaixo, que validam o tipo em tempo de execução.
export type ToolInput = Record<string, unknown>;

export type AssistantTool = {
  modulo: AssistantToolModule;
  spec: Anthropic.Tool;
  executar: (input: ToolInput, ctx: { userId: string }) => Promise<string>;
};

function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function str(input: ToolInput, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(input: ToolInput, key: string): boolean {
  return input[key] === true;
}

// ---------------------------------------------------------------------------
// consultar_processos
// ---------------------------------------------------------------------------

async function executarConsultarProcessos(input: ToolInput): Promise<string> {
  try {
    const cliente = str(input, "cliente");
    const area = str(input, "area");
    const status = str(input, "status");

    const cases = await prisma.case.findMany({
      where: {
        client: cliente ? { name: { contains: cliente, mode: "insensitive" } } : undefined,
        area: area ? { contains: area, mode: "insensitive" } : undefined,
        status: status || undefined,
      },
      include: { client: true, responsible: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    const resumo = cases.map((c) => ({
      id: c.id,
      title: c.title,
      processNumber: c.processNumber,
      status: c.status,
      area: c.area,
      cliente: c.client?.name ?? null,
      responsavel: c.responsible?.name ?? null,
    }));

    return JSON.stringify({ total: resumo.length, processos: resumo });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_processos:", error);
    return "Não foi possível consultar os processos agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_publicacoes
// ---------------------------------------------------------------------------

async function executarConsultarPublicacoes(input: ToolInput): Promise<string> {
  try {
    const diasAtras = num(input, "diasAtras") ?? 7;
    const apenasNaoLidas = bool(input, "apenasNaoLidas");
    const lawyerTag = str(input, "lawyerTag");

    const desde = new Date();
    desde.setDate(desde.getDate() - Math.max(1, diasAtras));

    const publicacoes = await prisma.publication.findMany({
      where: {
        publishedAt: { gte: desde },
        read: apenasNaoLidas ? false : undefined,
        lawyerTag: lawyerTag ? { contains: lawyerTag, mode: "insensitive" } : undefined,
      },
      include: { case: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });

    const resumo = publicacoes.map((p) => ({
      kind: p.kind,
      conteudo: truncate(p.content, 300),
      publishedAt: p.publishedAt,
      processo: p.case?.title ?? null,
      lawyerTag: p.lawyerTag,
      triageStatus: p.triageStatus,
    }));

    return JSON.stringify({ total: resumo.length, publicacoes: resumo });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_publicacoes:", error);
    return "Não foi possível consultar as publicações agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_agenda
// ---------------------------------------------------------------------------

async function executarConsultarAgenda(input: ToolInput): Promise<string> {
  try {
    const diasAFrente = num(input, "diasAFrente") ?? 7;
    const responsavel = str(input, "responsavel");

    const agora = new Date();
    const ate = new Date();
    ate.setDate(ate.getDate() + Math.max(1, diasAFrente));

    const tarefas = await prisma.task.findMany({
      where: {
        dueDate: { gte: agora, lte: ate },
        status: { notIn: ["CONCLUIDO", "CANCELADO"] },
        responsible: responsavel ? { name: { contains: responsavel, mode: "insensitive" } } : undefined,
      },
      include: { case: true, responsible: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    });

    const resumo = tarefas.map((t) => ({
      title: t.title,
      type: t.type,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      processo: t.case?.title ?? null,
      responsavel: t.responsible?.name ?? null,
    }));

    return JSON.stringify({ total: resumo.length, agenda: resumo });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_agenda:", error);
    return "Não foi possível consultar a agenda agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_atendimento
// ---------------------------------------------------------------------------

async function executarConsultarAtendimento(input: ToolInput): Promise<string> {
  try {
    const status = str(input, "status");
    const estagio = str(input, "estagio");

    // RASCUNHO só entra na busca se explicitamente pedido via `status`; por padrão fica de fora.
    const atendimentos = await prisma.attendance.findMany({
      where: {
        status: status ? status : { not: "RASCUNHO" },
        stage: estagio || undefined,
      },
      include: { responsible: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const resumo = atendimentos.map((a) => ({
      clientName: a.clientName,
      subject: a.subject,
      stage: a.stage,
      status: a.status,
      estimatedValue: a.estimatedValue,
      responsavel: a.responsible?.name ?? null,
    }));

    return JSON.stringify({ total: resumo.length, atendimentos: resumo });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_atendimento:", error);
    return "Não foi possível consultar o atendimento agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// buscar_cliente
// ---------------------------------------------------------------------------

async function executarBuscarCliente(input: ToolInput): Promise<string> {
  try {
    const nome = str(input, "nome");
    if (!nome) {
      return "Informe o nome do cliente a ser buscado.";
    }

    const clientes = await prisma.client.findMany({
      where: { name: { contains: nome, mode: "insensitive" } },
      include: { _count: { select: { cases: true } } },
      take: 20,
    });

    const resumo = clientes.map((c) => ({
      name: c.name,
      type: c.type,
      document: c.document,
      phone: c.phone,
      email: c.email,
      quantidadeProcessos: c._count.cases,
    }));

    return JSON.stringify({ total: resumo.length, clientes: resumo });
  } catch (error) {
    console.error("[assistantTools] erro em buscar_cliente:", error);
    return "Não foi possível buscar o cliente agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_financeiro (módulo "financeiro" — só oferecida a quem tem acesso)
// ---------------------------------------------------------------------------

async function executarConsultarFinanceiro(input: ToolInput): Promise<string> {
  try {
    const tipoRecebido = str(input, "tipo");
    const tipo: "pagar" | "receber" | "ambos" =
      tipoRecebido === "receber" || tipoRecebido === "ambos" ? tipoRecebido : "pagar";
    const apenasPendente = bool(input, "apenasPendente");

    const resultado: Record<string, unknown> = {};

    if (tipo === "pagar" || tipo === "ambos") {
      const payables = await prisma.payable.findMany({
        where: { status: apenasPendente ? "PENDENTE" : undefined },
        include: { category: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      });
      resultado.contasAPagar = {
        total: payables.length,
        somaValores: payables.reduce((acc, p) => acc + p.amount, 0),
        lista: payables.map((p) => ({
          description: p.description,
          amount: p.amount,
          dueDate: p.dueDate,
          status: p.status,
          categoria: p.category?.name ?? null,
        })),
      };
    }

    if (tipo === "receber" || tipo === "ambos") {
      const receivables = await prisma.receivable.findMany({
        where: { status: apenasPendente ? "PENDENTE" : undefined },
        include: { category: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      });
      resultado.contasAReceber = {
        total: receivables.length,
        somaValores: receivables.reduce((acc, r) => acc + r.amount, 0),
        lista: receivables.map((r) => ({
          description: r.description,
          amount: r.amount,
          dueDate: r.dueDate,
          status: r.status,
          categoria: r.category?.name ?? null,
        })),
      };
    }

    return JSON.stringify(resultado);
  } catch (error) {
    console.error("[assistantTools] erro em consultar_financeiro:", error);
    return "Não foi possível consultar o financeiro agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// Registro de ferramentas
// ---------------------------------------------------------------------------

export const assistantTools: AssistantTool[] = [
  {
    modulo: "processos",
    spec: {
      name: "consultar_processos",
      description:
        "Busca processos/casos do escritório por cliente, área do direito e/ou status. Use quando o usuário perguntar sobre um processo específico, os processos de um cliente, ou processos de determinada área/status.",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome (ou parte do nome) do cliente vinculado ao processo." },
          area: { type: "string", description: "Área do direito (ex: Cível, Trabalhista, Família, Tributário)." },
          status: { type: "string", description: "Status do processo: ATIVO, SUSPENSO, ENCERRADO ou ARQUIVADO." },
        },
        required: [],
      },
    },
    executar: (input) => executarConsultarProcessos(input),
  },
  {
    modulo: "publicacoes",
    spec: {
      name: "consultar_publicacoes",
      description:
        "Busca publicações e andamentos processuais recentes (diários oficiais, PJe, etc.). Use quando o usuário perguntar sobre publicações recentes, intimações, prazos publicados, ou o status de triagem delas.",
      input_schema: {
        type: "object",
        properties: {
          diasAtras: { type: "integer", description: "Quantos dias no passado considerar. Padrão: 7." },
          apenasNaoLidas: { type: "boolean", description: "Se true, retorna só publicações ainda não lidas." },
          lawyerTag: { type: "string", description: "Filtra pelo advogado citado na publicação (ex: Jairo, Rodrigo)." },
        },
        required: [],
      },
    },
    executar: (input) => executarConsultarPublicacoes(input),
  },
  {
    modulo: "agenda",
    spec: {
      name: "consultar_agenda",
      description:
        "Busca compromissos, tarefas, audiências e prazos futuros na agenda do escritório. Use quando o usuário perguntar o que tem na agenda, prazos próximos, audiências marcadas, ou tarefas de um responsável.",
      input_schema: {
        type: "object",
        properties: {
          diasAFrente: { type: "integer", description: "Quantos dias à frente considerar. Padrão: 7." },
          responsavel: { type: "string", description: "Nome (ou parte do nome) do responsável pela tarefa." },
        },
        required: [],
      },
    },
    executar: (input) => executarConsultarAgenda(input),
  },
  {
    modulo: "atendimento",
    spec: {
      name: "consultar_atendimento",
      description:
        "Busca atendimentos (triagem/CRM de captação de clientes). Use quando o usuário perguntar sobre leads, atendimentos em andamento, funil comercial ou estágio de negociação com um potencial cliente.",
      input_schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Status operacional: NOVO, EM_TRIAGEM, CONVERTIDO, ARQUIVADO ou RASCUNHO (rascunhos só são incluídos se este filtro for explicitamente RASCUNHO).",
          },
          estagio: { type: "string", description: "Estágio do funil comercial: NOVO, QUALIFICACAO, PROPOSTA, FECHADO ou PERDIDO." },
        },
        required: [],
      },
    },
    executar: (input) => executarConsultarAtendimento(input),
  },
  {
    modulo: "clientes",
    spec: {
      name: "buscar_cliente",
      description:
        "Busca dados cadastrais de um cliente pelo nome. Use quando o usuário perguntar dados de contato, documento ou quantos processos um cliente tem.",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome (ou parte do nome) do cliente a buscar." },
        },
        required: ["nome"],
      },
    },
    executar: (input) => executarBuscarCliente(input),
  },
  {
    modulo: "financeiro",
    spec: {
      name: "consultar_financeiro",
      description:
        "Busca contas a pagar e/ou a receber do escritório, com totais e lista resumida. Só deve ser usada se o usuário tiver acesso ao módulo Financeiro. Use quando perguntarem sobre valores a pagar/receber, contas pendentes ou totais financeiros.",
      input_schema: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["pagar", "receber", "ambos"], description: "Qual tipo de conta consultar." },
          apenasPendente: { type: "boolean", description: "Se true, retorna apenas contas com status PENDENTE." },
        },
        required: ["tipo"],
      },
    },
    executar: (input) => executarConsultarFinanceiro(input),
  },
];
