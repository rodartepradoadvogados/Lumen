import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { valorLiquido } from "@/lib/financeCalc";
import { caseMatchesMateria } from "@/lib/caseMaterias";

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
  executar: (input: ToolInput, ctx: { userId: string; officeId: string }) => Promise<string>;
};

// ============================================================================
// UM AVISO QUE CUSTOU CARO
//
// Toda consulta aqui traz no máximo 20 registros — e até 19/09/2026 todas elas devolviam
// `total: resumo.length`, ou seja, o tamanho da PÁGINA, não o total de verdade. Perguntaram ao
// assistente "quantos processos eu tenho?" num escritório com mais de cem, e ele respondeu "20",
// com toda a confiança do mundo.
//
// Um assistente que erra um número e avisa é inconveniente. Um que erra e afirma é pior que não
// ter assistente, porque o advogado age sobre o número.
//
// Então a regra desta casa: quem mostra uma amostra CONTA o universo. `total` é a contagem real no
// banco; `mostrados` é quanto veio na amostra; `truncado` diz se sobrou coisa de fora. As três
// juntas tornam impossível confundir uma com a outra.
// ============================================================================

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

async function executarConsultarProcessos(input: ToolInput, officeId: string): Promise<string> {
  try {
    const cliente = str(input, "cliente");
    const area = str(input, "area");
    const status = str(input, "status");

    // Prisma não faz "contains" case-insensitive em coluna String[] (Case.materias) — busca um
    // lote maior de candidatos (só client/status, indexáveis) e filtra por matéria em memória.
    const filtro = {
      officeId,
      client: cliente ? { name: { contains: cliente, mode: "insensitive" as const } } : undefined,
      status: status || undefined,
    };

    const [totalNoBanco, cases] = await Promise.all([
      prisma.case.count({ where: filtro }),
      prisma.case.findMany({
        where: filtro,
        include: { client: true, responsible: true },
        orderBy: { updatedAt: "desc" },
        take: area ? 100 : 20,
      }),
    ]);
    const filtered = area ? cases.filter((c) => caseMatchesMateria(c.materias, c.area, area)) : cases;

    const resumo = filtered.slice(0, 20).map((c) => ({
      id: c.id,
      title: c.title,
      processNumber: c.processNumber,
      status: c.status,
      materias: c.materias,
      cliente: c.client?.name ?? null,
      responsavel: c.responsible?.name ?? null,
    }));

    // Com filtro de matéria o total exato não existe em SQL: a matéria é comparada em memória
    // sobre uma amostra (ver a nota acima do findMany). Dizer isso é melhor que chutar um número.
    return JSON.stringify(
      area
        ? {
            totalNoEscritorio: totalNoBanco,
            mostrados: resumo.length,
            observacao: `A matéria "${area}" foi conferida sobre os ${cases.length} processos mais recentes, não sobre todos os ${totalNoBanco}.`,
            processos: resumo,
          }
        : {
            total: totalNoBanco,
            mostrados: resumo.length,
            truncado: totalNoBanco > resumo.length,
            processos: resumo,
          },
    );
  } catch (error) {
    console.error("[assistantTools] erro em consultar_processos:", error);
    return "Não foi possível consultar os processos agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_publicacoes
// ---------------------------------------------------------------------------

async function executarConsultarPublicacoes(input: ToolInput, officeId: string, userId: string): Promise<string> {
  try {
    const diasAtras = num(input, "diasAtras") ?? 7;
    const apenasNaoLidas = bool(input, "apenasNaoLidas");
    const lawyerTag = str(input, "lawyerTag");

    const desde = new Date();
    desde.setDate(desde.getDate() - Math.max(1, diasAtras));

    // "Não lida" é por usuário — reflete a visão de quem está perguntando ao assistente, não
    // um estado único compartilhado pelo escritório inteiro (ver PublicationRead no schema).
    const filtro = {
      officeId,
      publishedAt: { gte: desde },
      reads: apenasNaoLidas ? { none: { userId } } : undefined,
      lawyerTag: lawyerTag ? { contains: lawyerTag, mode: "insensitive" as const } : undefined,
    };

    const [totalNoBanco, publicacoes] = await Promise.all([
      prisma.publication.count({ where: filtro }),
      prisma.publication.findMany({
        where: filtro,
        include: { case: true },
        orderBy: { publishedAt: "desc" },
        take: 20,
      }),
    ]);

    const resumo = publicacoes.map((p) => ({
      kind: p.kind,
      conteudo: truncate(p.content, 300),
      publishedAt: p.publishedAt,
      processo: p.case?.title ?? null,
      lawyerTag: p.lawyerTag,
      triageStatus: p.triageStatus,
    }));

    return JSON.stringify({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      publicacoes: resumo,
    });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_publicacoes:", error);
    return "Não foi possível consultar as publicações agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_agenda
// ---------------------------------------------------------------------------

async function executarConsultarAgenda(input: ToolInput, officeId: string): Promise<string> {
  try {
    const diasAFrente = num(input, "diasAFrente") ?? 7;
    const responsavel = str(input, "responsavel");

    const agora = new Date();
    const ate = new Date();
    ate.setDate(ate.getDate() + Math.max(1, diasAFrente));

    const filtro = {
      officeId,
      dueDate: { gte: agora, lte: ate },
      status: { notIn: ["CONCLUIDO", "CANCELADO"] },
      responsible: responsavel ? { name: { contains: responsavel, mode: "insensitive" as const } } : undefined,
    };

    const [totalNoBanco, tarefas] = await Promise.all([
      prisma.task.count({ where: filtro }),
      prisma.task.findMany({
        where: filtro,
        include: { case: true, responsible: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
    ]);

    const resumo = tarefas.map((t) => ({
      title: t.title,
      type: t.type,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      processo: t.case?.title ?? null,
      responsavel: t.responsible?.name ?? null,
    }));

    return JSON.stringify({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      agenda: resumo,
    });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_agenda:", error);
    return "Não foi possível consultar a agenda agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_atendimento
// ---------------------------------------------------------------------------

async function executarConsultarAtendimento(input: ToolInput, officeId: string): Promise<string> {
  try {
    const status = str(input, "status");
    const estagio = str(input, "estagio");

    // RASCUNHO só entra na busca se explicitamente pedido via `status`; por padrão fica de fora.
    const filtro = {
      officeId,
      status: status ? status : { not: "RASCUNHO" },
      stage: estagio || undefined,
    };

    const [totalNoBanco, atendimentos] = await Promise.all([
      prisma.attendance.count({ where: filtro }),
      prisma.attendance.findMany({
        where: filtro,
        include: { responsible: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const resumo = atendimentos.map((a) => ({
      clientName: a.clientName,
      subject: a.subject,
      stage: a.stage,
      status: a.status,
      estimatedValue: a.estimatedValue,
      responsavel: a.responsible?.name ?? null,
    }));

    return JSON.stringify({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      atendimentos: resumo,
    });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_atendimento:", error);
    return "Não foi possível consultar o atendimento agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// buscar_cliente
// ---------------------------------------------------------------------------

async function executarBuscarCliente(input: ToolInput, officeId: string): Promise<string> {
  try {
    const nome = str(input, "nome");
    if (!nome) {
      return "Informe o nome do cliente a ser buscado.";
    }

    const filtro = { officeId, name: { contains: nome, mode: "insensitive" as const } };

    const [totalNoBanco, clientes] = await Promise.all([
      prisma.client.count({ where: filtro }),
      prisma.client.findMany({
        where: filtro,
        include: { _count: { select: { cases: true } } },
        take: 20,
      }),
    ]);

    const resumo = clientes.map((c) => ({
      name: c.name,
      type: c.type,
      document: c.document,
      phone: c.phone,
      email: c.email,
      quantidadeProcessos: c._count.cases,
    }));

    return JSON.stringify({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      clientes: resumo,
    });
  } catch (error) {
    console.error("[assistantTools] erro em buscar_cliente:", error);
    return "Não foi possível buscar o cliente agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_financeiro (módulo "financeiro" — só oferecida a quem tem acesso)
// ---------------------------------------------------------------------------

async function executarConsultarFinanceiro(input: ToolInput, officeId: string): Promise<string> {
  try {
    const tipoRecebido = str(input, "tipo");
    const tipo: "pagar" | "receber" | "ambos" =
      tipoRecebido === "receber" || tipoRecebido === "ambos" ? tipoRecebido : "pagar";
    const apenasPendente = bool(input, "apenasPendente");

    const resultado: Record<string, unknown> = {};

    // status: mesmo quando "apenasPendente" é false (traz todos os status), A_APURAR é excluído
    // explicitamente da consulta — é só uma ESTIMATIVA de honorário percentual sem valor real
    // ainda, o assistente não pode informar isso como "a receber" de verdade ao usuário.
    if (tipo === "pagar" || tipo === "ambos") {
      const filtroPayable = {
        officeId,
        status: apenasPendente ? "PENDENTE" : { not: "A_APURAR" },
      };

      // A SOMA É DO UNIVERSO, NÃO DA AMOSTRA. Somar só os 20 mostrados daria um valor errado com
      // cara de certo — e aqui é dinheiro: o advogado decide em cima desse número. Como
      // `valorLiquido` é amount menos desconto mais acréscimo, a soma real sai de uma agregação,
      // sem precisar trazer todas as linhas para a memória.
      const [totalPayable, somaPayable, payables] = await Promise.all([
        prisma.payable.count({ where: filtroPayable }),
        prisma.payable.aggregate({
          where: filtroPayable,
          _sum: { amount: true, discount: true, surcharge: true },
        }),
        prisma.payable.findMany({
          where: filtroPayable,
          include: { category: true },
          orderBy: { dueDate: "asc" },
          take: 20,
        }),
      ]);

      resultado.contasAPagar = {
        total: totalPayable,
        mostrados: payables.length,
        truncado: totalPayable > payables.length,
        somaValores: valorLiquido(
          somaPayable._sum.amount ?? 0,
          somaPayable._sum.discount ?? 0,
          somaPayable._sum.surcharge ?? 0,
        ),
        lista: payables.map((p) => ({
          description: p.description,
          amount: valorLiquido(p.amount, p.discount, p.surcharge),
          dueDate: p.dueDate,
          status: p.status,
          categoria: p.category?.name ?? null,
        })),
      };
    }

    if (tipo === "receber" || tipo === "ambos") {
      const filtroReceivable = {
        officeId,
        status: apenasPendente ? "PENDENTE" : { not: "A_APURAR" },
      };

      // A SOMA É DO UNIVERSO, NÃO DA AMOSTRA. Somar só os 20 mostrados daria um valor errado com
      // cara de certo — e aqui é dinheiro: o advogado decide em cima desse número. Como
      // `valorLiquido` é amount menos desconto mais acréscimo, a soma real sai de uma agregação,
      // sem precisar trazer todas as linhas para a memória.
      const [totalReceivable, somaReceivable, receivables] = await Promise.all([
        prisma.receivable.count({ where: filtroReceivable }),
        prisma.receivable.aggregate({
          where: filtroReceivable,
          _sum: { amount: true, discount: true, surcharge: true },
        }),
        prisma.receivable.findMany({
          where: filtroReceivable,
          include: { category: true },
          orderBy: { dueDate: "asc" },
          take: 20,
        }),
      ]);

      resultado.contasAReceber = {
        total: totalReceivable,
        mostrados: receivables.length,
        truncado: totalReceivable > receivables.length,
        somaValores: valorLiquido(
          somaReceivable._sum.amount ?? 0,
          somaReceivable._sum.discount ?? 0,
          somaReceivable._sum.surcharge ?? 0,
        ),
        lista: receivables.map((r) => ({
          description: r.description,
          amount: valorLiquido(r.amount, r.discount, r.surcharge),
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
    executar: (input, ctx) => executarConsultarProcessos(input, ctx.officeId),
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
    executar: (input, ctx) => executarConsultarPublicacoes(input, ctx.officeId, ctx.userId),
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
    executar: (input, ctx) => executarConsultarAgenda(input, ctx.officeId),
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
    executar: (input, ctx) => executarConsultarAtendimento(input, ctx.officeId),
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
    executar: (input, ctx) => executarBuscarCliente(input, ctx.officeId),
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
    executar: (input, ctx) => executarConsultarFinanceiro(input, ctx.officeId),
  },
];
