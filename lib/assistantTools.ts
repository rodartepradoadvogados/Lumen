import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { NivelFinanceiro, QuemPergunta } from "@/lib/nivelFinanceiro";
import { podeVerNivel, valoresOuOmissao } from "@/lib/nivelFinanceiro";
import { calcularDre, periodoAnterior, variacaoPercentual } from "@/lib/dreCalculo";
import { inicioDoMesEmBrasilia, inicioDoProximoMesEmBrasilia, dataDeBrasilia, lerPeriodoEmBrasilia } from "@/lib/horaDeBrasilia";
import { valorLiquido } from "@/lib/financeCalc";
import { caseMatchesMateria } from "@/lib/caseMaterias";
import { formatarEquipe } from "@/lib/equipeFormato";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import { pendenciaKindLabel } from "@/lib/pendencias";

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
  | "financeiro"
  | "equipe"
  | "documentos"
  | "tarefas"
  | "assessorias";

// Entrada bruta de um tool_use — vem de fora (o modelo), então nunca é tipada
// como a interface "ideal" da ferramenta; cada `executar` lê os campos que
// precisa com os helpers abaixo, que validam o tipo em tempo de execução.
export type ToolInput = Record<string, unknown>;

export type AssistantTool = {
  modulo: AssistantToolModule;
  /**
   * Dentro do financeiro há DOIS níveis (ver lib/nivelFinanceiro.ts): registro — o que está
   * lançado — e indicador — o que é produzido a partir do que está lançado. Registro é de quem
   * tem acesso ao financeiro; indicador é só de sócio.
   *
   * Ausente em ferramenta que não é do financeiro, onde a distinção não existe. A porta que
   * aplica isso é app/api/agente/ferramentas/route.ts, e é lá que tem de continuar: uma regra de
   * acesso conferida no lugar onde o dado é produzido, e não onde ele é pedido, mais cedo ou mais
   * tarde é contornada por um caminho novo que esqueceu de conferir.
   */
  nivel?: NivelFinanceiro;
  spec: Anthropic.Tool;
  /**
   * `financeiro`/`admin`: a MESMA dupla de `QuemPergunta` (lib/nivelFinanceiro.ts), levada até
   * quem executa a ferramenta. Toda ferramenta de módulo "financeiro" já é barrada ANTES de
   * chegar aqui (pela lista oferecida e pela dupla checagem nas duas rotas) — esses dois campos
   * existem para a ferramenta que NÃO é do financeiro mas TEM um bloco de dinheiro por dentro
   * (o histórico do cliente, a mensalidade de uma assessoria): ela decide sozinha se mostra ou
   * omite aquele bloco, com `valoresOuOmissao`. Ausentes (chamada antiga, teste) contam como
   * "sem acesso a nada" — fechado por padrão, o mesmo princípio de `podeVerNivel`.
   */
  executar: (
    input: ToolInput,
    ctx: { userId: string; officeId: string; financeiro?: boolean; admin?: boolean },
  ) => Promise<string>;
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

// ============================================================================
// AMOSTRA NÃO É UNIVERSO — e dizer o total não bastou.
//
// Perguntaram ao agente: "liste as contas a pagar e a receber ainda de setembro de 2026". Ele
// respondeu, com toda a calma: "não há dados — o sistema só retorna lançamentos de jan a mar/2026".
//
// Estava errado, e o erro não era dele. A consulta não tinha filtro de data e devolvia os 20
// vencimentos MAIS ANTIGOS. Ele recebeu janeiro a março, viu que setembro não estava ali, e
// concluiu que setembro não existe. `truncado: true` estava na resposta e não impediu nada: um
// booleano não diz o que NÃO fazer com ele.
//
// Duas correções, e as duas importam:
//
// 1. A consulta financeira passa a aceitar período (`de`/`ate`). Perguntou de setembro, filtra
//    setembro — e aí a resposta é sobre setembro, não sobre uma amostra que começa em janeiro.
// 2. TODA consulta truncada passa a carregar um aviso em português dizendo, com todas as letras,
//    que a lista é uma amostra e que dela NÃO se conclui ausência. É instrução, não bandeira.
//
// Concluir ausência a partir de uma amostra é o erro mais caro que este agente pode cometer:
// "não há conta a pagar em setembro" faz o escritório não pagar a conta.
// ============================================================================

const AVISO_AMOSTRA =
  "ATENÇÃO: esta lista é uma AMOSTRA e não o conjunto inteiro (veja `total` e `mostrados`). " +
  "NÃO conclua que algo não existe por não estar nela — o que você procura pode estar entre os " +
  "itens que ficaram de fora. Para responder sobre um período ou filtro específico, refaça a " +
  "consulta com os parâmetros adequados em vez de garimpar esta lista.";

/** Junta ao resultado o aviso, mas só quando ele é verdade: sem truncamento, ele só faria ruído. */
function comAviso<T extends { truncado: boolean }>(dados: T): T & { aviso?: string } {
  return dados.truncado ? { ...dados, aviso: AVISO_AMOSTRA } : dados;
}

/**
 * Lê uma data vinda do agente. Aceita "2026-09" (o mês inteiro) e "2026-09-01".
 *
 * `fim = true` empurra para o FIM do período: "2026-09" vira 30/09 às 23:59:59, e não 01/09 às
 * zero hora — senão "de 2026-09 até 2026-09" devolveria um intervalo de um instante só, e a
 * resposta seria "nada em setembro" por um motivo novo.
 */
export function lerData(valor: string | undefined, fim: boolean): Date | undefined {
  if (!valor) return undefined;
  const mes = valor.match(/^(\d{4})-(\d{2})$/);
  if (mes) {
    const ano = Number(mes[1]);
    const m = Number(mes[2]) - 1;
    // `2026-13` casa com a expressão e o JavaScript o aceita CALADO, rolando para janeiro de
    // 2027. Um período que ninguém pediu, devolvendo vazio com cara de resposta, é pior que
    // filtro nenhum — então mês fora de 1..12 não é data.
    if (m < 0 || m > 11) return undefined;
    return fim ? new Date(ano, m + 1, 0, 23, 59, 59, 999) : new Date(ano, m, 1, 0, 0, 0, 0);
  }
  const dia = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dia) {
    const [ano, m, d] = [Number(dia[1]), Number(dia[2]) - 1, Number(dia[3])];
    if (m < 0 || m > 11 || d < 1 || d > 31) return undefined;
    const data = fim ? new Date(ano, m, d, 23, 59, 59, 999) : new Date(ano, m, d, 0, 0, 0, 0);
    // A mesma rolagem silenciosa do mês, agora no dia: `2026-02-30` vira 2 de março. Conferir o
    // que a data VIROU contra o que foi pedido é o único jeito de pegar isso.
    if (data.getMonth() !== m || data.getDate() !== d) return undefined;
    return data;
  }
  return undefined;
}

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

// ============================================================================
// O LINK DE CADA RESULTADO.
//
// Pediram ao agente "liste os processos com publicação nos últimos 5 dias, com hiperlink para eu
// clicar e abrir o processo". Ele respondeu, com razão: "o Lúmen não retorna hiperlinks". As
// consultas devolviam o `id` do processo e mais nada — e o agente não tem como saber que a tela
// dele mora em `/processos/<id>`, nem deve adivinhar.
//
// Agora cada item traz o seu `link`, e a resposta deixa de ser uma lista que o advogado tem que
// copiar e procurar na busca. É a diferença entre ler sobre o processo e ir até ele.
//
// SEMPRE PARA ONDE DÁ PARA AGIR. Uma publicação vale mais apontando para o PROCESSO dela do que
// para a lista de publicações: é lá que a pessoa vai decidir o que fazer. Sem processo vinculado,
// sobra a lista — que ainda é melhor que nada.
// ============================================================================
function linkDoProcesso(caseId: string | null | undefined): string {
  return caseId ? `/processos/${caseId}` : "/processos";
}

function linkDoAtendimento(attendanceId: string | null | undefined): string {
  return attendanceId ? `/atendimento/${attendanceId}` : "/atendimento";
}

function linkDaAssessoria(assessoriaId: string | null | undefined): string {
  return assessoriaId ? `/assessoria/${assessoriaId}` : "/assessoria";
}

/** Tarefa aponta para o processo quando tem um; senão para o atendimento; senão para a agenda. */
function linkDaTarefa(caseId: string | null | undefined, attendanceId: string | null | undefined): string {
  if (caseId) return linkDoProcesso(caseId);
  if (attendanceId) return linkDoAtendimento(attendanceId);
  return "/agenda";
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
      link: linkDoProcesso(c.id),
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
        : comAviso({
            total: totalNoBanco,
            mostrados: resumo.length,
            truncado: totalNoBanco > resumo.length,
            processos: resumo,
          }),
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
      // Aponta para o PROCESSO da publicação, que é onde se age. Sem processo vinculado — o caso
      // das intimações do PROJUDI que chegam soltas — sobra a lista de publicações.
      link: p.caseId ? linkDoProcesso(p.caseId) : "/publicacoes",
      conteudo: truncate(p.content, 300),
      publishedAt: p.publishedAt,
      processo: p.case?.title ?? null,
      lawyerTag: p.lawyerTag,
      triageStatus: p.triageStatus,
    }));

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      publicacoes: resumo,
    }));
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
      link: t.caseId ? linkDoProcesso(t.caseId) : "/agenda",
      title: t.title,
      type: t.type,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      processo: t.case?.title ?? null,
      responsavel: t.responsible?.name ?? null,
    }));

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      agenda: resumo,
    }));
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

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      atendimentos: resumo,
    }));
  } catch (error) {
    console.error("[assistantTools] erro em consultar_atendimento:", error);
    return "Não foi possível consultar o atendimento agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// buscar_cliente
//
// SEM `nome`, esta ferramenta virou também a LISTA de clientes do escritório (F6, item "clientes"
// da entrevista do dono: "a lista/ficha de clientes do escritório") — não uma ferramenta nova ao
// lado dela. Com `nome`, continua sendo a busca/ficha que já era. Uma ferramenta que já sabia
// filtrar por cliente só precisava aprender a responder também sem filtro nenhum.
// ---------------------------------------------------------------------------

async function executarBuscarCliente(input: ToolInput, officeId: string): Promise<string> {
  try {
    const nome = str(input, "nome");

    const filtro = { officeId, name: nome ? { contains: nome, mode: "insensitive" as const } : undefined };

    const [totalNoBanco, clientes] = await Promise.all([
      prisma.client.count({ where: filtro }),
      prisma.client.findMany({
        where: filtro,
        include: { _count: { select: { cases: true } } },
        // Sem `nome`, isto é a LISTA do escritório inteiro — ordem alfabética é a única que faz
        // sentido para folhear; com `nome`, a ordem quase não importa (poucos resultados).
        orderBy: { name: "asc" },
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

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      clientes: resumo,
    }));
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

    // O PERÍODO. Sem ele, a pergunta "e setembro?" recebia os vencimentos mais antigos do
    // escritório e virava "setembro não existe".
    const de = lerData(str(input, "de"), false);
    const ate = lerData(str(input, "ate"), true);
    const porVencimento = de || ate ? { dueDate: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {};

    const resultado: Record<string, unknown> = {};
    // Ecoa o período de volta. O agente precisa poder dizer "em setembro de 2026 não há conta" em
    // vez de "não há conta" — a segunda frase é falsa, e é a que assusta quem lê.
    resultado.periodo = de || ate
      ? { de: de ? de.toISOString().slice(0, 10) : null, ate: ate ? ate.toISOString().slice(0, 10) : null }
      : "todo o histórico";

    // status: mesmo quando "apenasPendente" é false (traz todos os status), A_APURAR é excluído
    // explicitamente da consulta — é só uma ESTIMATIVA de honorário percentual sem valor real
    // ainda, o assistente não pode informar isso como "a receber" de verdade ao usuário.
    if (tipo === "pagar" || tipo === "ambos") {
      const filtroPayable = {
        officeId,
        status: apenasPendente ? "PENDENTE" : { not: "A_APURAR" },
        ...porVencimento,
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

      resultado.contasAPagar = comAviso({
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
      });
    }

    if (tipo === "receber" || tipo === "ambos") {
      const filtroReceivable = {
        officeId,
        status: apenasPendente ? "PENDENTE" : { not: "A_APURAR" },
        ...porVencimento,
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

      resultado.contasAReceber = comAviso({
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
      });
    }

    return JSON.stringify(resultado);
  } catch (error) {
    console.error("[assistantTools] erro em consultar_financeiro:", error);
    return "Não foi possível consultar o financeiro agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_indicadores (financeiro, nível INDICADOR — só sócio)
// ---------------------------------------------------------------------------

/**
 * O período do indicador: o mês corrente NO ESCRITÓRIO, quando não disserem outro.
 *
 * O mês é calculado no fuso de Brasília, e não em UTC, porque "faturamento do mês" perguntado no
 * dia 1º às oito da manhã não pode responder pelo mês anterior só porque, em UTC, ainda era o
 * outro dia. O fim é EXCLUSIVO — é a convenção de lib/caixaMovimentos.ts, e misturar as duas
 * convenções faria o último dia do mês entrar duas vezes ou nenhuma.
 */
export function periodoDoIndicador(de: string | undefined, ate: string | undefined, agora: Date): { de: Date; ate: Date } {
  const inicio = lerPeriodoEmBrasilia(de);
  const fim = lerPeriodoEmBrasilia(ate);

  // Informar só uma das pontas quer dizer "este mês/dia", e não "daqui em diante": "daqui em
  // diante" transformaria a pergunta "como foi março?" numa resposta sobre março até hoje, com
  // cara de resposta sobre março. Errado e convincente é a pior combinação num número de dinheiro.
  if (inicio && fim) return { de: inicio.de, ate: fim.ate };
  if (inicio) return inicio;
  if (fim) return fim;
  return { de: inicioDoMesEmBrasilia(agora), ate: inicioDoProximoMesEmBrasilia(agora) };
}

/**
 * Com o que comparar.
 *
 * Quando o período é um MÊS DE CALENDÁRIO inteiro, a comparação é com o mês de calendário
 * anterior. Fora disso, cai no período de mesma duração encostado antes (lib/dreCalculo.ts).
 *
 * A diferença não é cosmética. `periodoAnterior` compara setembro (30 dias) com "os 30 dias antes
 * de setembro", que começam em 2 de agosto — então agosto entra faltando um dia e o número sai
 * menor. Quem lê "mês anterior" numa reunião de sócios entende MÊS ANTERIOR, e decide em cima de
 * uma queda que não existiu.
 */
export function periodoDeComparacao(periodo: { de: Date; ate: Date }, fuso?: string): { de: Date; ate: Date } {
  const ehMesInteiro =
    inicioDoMesEmBrasilia(periodo.de, fuso).getTime() === periodo.de.getTime() &&
    inicioDoProximoMesEmBrasilia(periodo.de, fuso).getTime() === periodo.ate.getTime();
  if (!ehMesInteiro) return periodoAnterior(periodo);
  // Um milissegundo antes do começo do mês é o último instante do mês anterior.
  return { de: inicioDoMesEmBrasilia(new Date(periodo.de.getTime() - 1), fuso), ate: periodo.de };
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

async function executarConsultarIndicadores(input: ToolInput, officeId: string): Promise<string> {
  try {
    const agora = new Date();
    const periodo = periodoDoIndicador(str(input, "de"), str(input, "ate"), agora);
    const anterior = periodoDeComparacao(periodo);

    const [atual, passado, recebidos, vencidos] = await Promise.all([
      calcularDre(officeId, periodo),
      calcularDre(officeId, anterior),
      // TICKET MÉDIO sai daqui, e não da DRE: ele precisa da QUANTIDADE de recebimentos, e a DRE
      // só devolve somas. `paidDate` dentro do período é o recorte certo — recebimento é quando
      // o dinheiro entrou, não quando a conta foi criada.
      prisma.receivable.aggregate({
        where: { officeId, status: "PAGO", paidDate: { gte: periodo.de, lt: periodo.ate } },
        _sum: { paidAmount: true },
        _count: true,
      }),
      // INADIMPLÊNCIA: vencida e ainda não paga, medida HOJE e não no fim do período. Uma conta
      // que venceu em março e segue aberta é inadimplência agora, não um fato de março.
      prisma.receivable.aggregate({
        where: { officeId, status: { notIn: ["PAGO", "CANCELADO", "A_APURAR"] }, noDueDate: false, dueDate: { lt: agora } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const faturamento = atual.totalReceitas;
    const quantosRecebimentos = recebidos._count;
    const somaRecebida = recebidos._sum.paidAmount ?? 0;

    return JSON.stringify({
      periodo: {
        de: dataDeBrasilia(periodo.de),
        // O fim é exclusivo por dentro; para quem lê, mostra-se o último dia que ENTRA.
        ate: dataDeBrasilia(new Date(periodo.ate.getTime() - 1)),
      },
      faturamento: arredondar(faturamento),
      despesas: arredondar(atual.totalDespesas),
      lucro: arredondar(atual.resultado),
      margemPercentual: faturamento > 0 ? arredondar((atual.resultado / faturamento) * 100) : null,
      comparacaoComPeriodoAnterior: {
        periodo: { de: dataDeBrasilia(anterior.de), ate: dataDeBrasilia(new Date(anterior.ate.getTime() - 1)) },
        faturamento: arredondar(passado.totalReceitas),
        lucro: arredondar(passado.resultado),
        variacaoDoFaturamentoPercentual: variacaoPercentual(faturamento, passado.totalReceitas),
        variacaoDoLucroPercentual: variacaoPercentual(atual.resultado, passado.resultado),
      },
      ticketMedio: {
        recebimentos: quantosRecebimentos,
        somaRecebida: arredondar(somaRecebida),
        valor: quantosRecebimentos > 0 ? arredondar(somaRecebida / quantosRecebimentos) : null,
      },
      inadimplencia: {
        // A palavra "hoje" está no nome porque o número é de hoje, e não do período consultado —
        // sem isso o agente diria "a inadimplência de agosto foi X", que é outra coisa.
        contasVencidasHoje: vencidos._count,
        somaVencidaHoje: arredondar(vencidos._sum.amount ?? 0),
      },
      // O aviso viaja com o dado, e não só no prompt: quem lê o número precisa saber de onde ele
      // vem, senão compara maçã com laranja na reunião de sócios.
      comoEstesNumerosSaoApurados:
        "Regime de CAIXA: faturamento e despesas são o que efetivamente entrou e saiu no período, " +
        "não o que foi faturado ou contratado. Adiantamentos e reembolsos não entram como receita " +
        "nem despesa (são transferência). A inadimplência é medida HOJE, não no fim do período.",
    });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_indicadores:", error);
    return "Não foi possível apurar os indicadores agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_equipe (F6) — nome, função e escala. SÓ ISSO.
//
// Decisão expressa do dono na entrevista: "a ferramenta de equipe NUNCA devolve telefone nem
// e-mail de ninguém". Duas travas, não uma: o `select` abaixo já não pede esses campos ao banco,
// e `formatarEquipe` (lib/equipeFormato.ts) descarta qualquer campo a mais que chegue até ela —
// ver o comentário lá para o porquê de a trava ser uma função pura e não só este `select`.
// ---------------------------------------------------------------------------

async function executarConsultarEquipe(input: ToolInput, officeId: string): Promise<string> {
  try {
    const nome = str(input, "nome");
    const apenasNaEscala = bool(input, "apenasNaEscala");
    // Inativo continua fora por padrão — como em toda outra ferramenta desta casa que lista
    // pessoas ou registros vivos; incluir quem saiu do escritório é a exceção, não a regra.
    const incluirInativos = bool(input, "incluirInativos");

    const filtro = {
      officeId,
      active: incluirInativos ? undefined : true,
      name: nome ? { contains: nome, mode: "insensitive" as const } : undefined,
      recebeTransferencia: apenasNaEscala ? true : undefined,
    };

    const [totalNoBanco, linhas] = await Promise.all([
      prisma.user.count({ where: filtro }),
      prisma.user.findMany({
        where: filtro,
        // A TRAVA Nº 1: só estes três campos saem do banco. Nunca `include`, nunca o User
        // inteiro — telefone, e-mail, CPF, endereço e hash de senha moram no mesmo registro.
        select: { name: true, role: true, recebeTransferencia: true },
        orderBy: { name: "asc" },
        take: 20,
      }),
    ]);

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: linhas.length,
      truncado: totalNoBanco > linhas.length,
      // A TRAVA Nº 2: mesmo que o `select` acima um dia vaze campo a mais, só nome/função/escala
      // atravessam esta função pura (ver lib/equipeFormato.ts).
      equipe: formatarEquipe(linhas),
    }));
  } catch (error) {
    console.error("[assistantTools] erro em consultar_equipe:", error);
    return "Não foi possível consultar a equipe agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_pendencias (F6) — as pendências do atendimento (Fase 5): o que falta pedir AO lead
// (SOLICITAR) ou mandar PARA ele (ENVIAR) para fechar a triagem.
// ---------------------------------------------------------------------------

async function executarConsultarPendencias(input: ToolInput, officeId: string): Promise<string> {
  try {
    const status = str(input, "status"); // PENDENTE | CONCLUIDA
    const direcao = str(input, "direcao"); // SOLICITAR | ENVIAR
    const responsavel = str(input, "responsavel");
    const somenteVencidas = bool(input, "somenteVencidas");

    const filtro = {
      officeId,
      // Sem filtro explícito, só o que ainda está em aberto — é o que a pergunta "o que está
      // pendente" quer dizer; quem quiser o que já foi resolvido pede CONCLUIDA de propósito.
      status: status || "PENDENTE",
      direction: direcao || undefined,
      dueDate: somenteVencidas ? { lt: new Date() } : undefined,
      responsible: responsavel ? { name: { contains: responsavel, mode: "insensitive" as const } } : undefined,
    };

    const [totalNoBanco, pendencias] = await Promise.all([
      prisma.atendimentoPendencia.count({ where: filtro }),
      prisma.atendimentoPendencia.findMany({
        where: filtro,
        include: { attendance: true, responsible: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
    ]);

    const resumo = pendencias.map((p) => ({
      link: linkDoAtendimento(p.attendanceId),
      direcao: p.direction,
      tipo: pendenciaKindLabel(p.direction, p.kind),
      descricao: p.description,
      status: p.status,
      dueDate: p.dueDate,
      atendimento: p.attendance?.clientName ?? null,
      responsavel: p.responsible?.name ?? null,
    }));

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      pendencias: resumo,
    }));
  } catch (error) {
    console.error("[assistantTools] erro em consultar_pendencias:", error);
    return "Não foi possível consultar as pendências agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_documentos (F6) — os anexos (Attachment) do escritório: processo, atendimento ou
// licitação, com o link do Drive de quem quer abrir o arquivo em vez de só saber que ele existe.
// ---------------------------------------------------------------------------

async function executarConsultarDocumentos(input: ToolInput, officeId: string): Promise<string> {
  try {
    const cliente = str(input, "cliente");
    const tipo = str(input, "tipo");
    const diasAtras = num(input, "diasAtras");

    const desde = diasAtras ? new Date(Date.now() - Math.max(1, diasAtras) * 86_400_000) : undefined;

    const filtro = {
      officeId,
      docType: tipo || undefined,
      createdAt: desde ? { gte: desde } : undefined,
      // O documento pode estar preso a um Processo OU a um Atendimento — o nome do cliente mora
      // em lugares diferentes em cada um (Case.client.name vs. Attendance.clientName), então a
      // busca por cliente precisa olhar os dois.
      OR: cliente
        ? [
            { case: { client: { name: { contains: cliente, mode: "insensitive" as const } } } },
            { attendance: { clientName: { contains: cliente, mode: "insensitive" as const } } },
          ]
        : undefined,
    };

    const [totalNoBanco, documentos] = await Promise.all([
      prisma.attachment.count({ where: filtro }),
      prisma.attachment.findMany({
        where: filtro,
        include: { case: { include: { client: true } }, attendance: true, uploadedBy: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const resumo = documentos.map((a) => ({
      // O link de um documento É o arquivo — não uma tela do Lúmen. Diferente de processo/tarefa,
      // aqui "onde se age" é o próprio Drive.
      link: a.driveUrl,
      name: a.name,
      tipo: getDocumentTypeLabel(a.docType),
      createdAt: a.createdAt,
      processo: a.case?.title ?? null,
      cliente: a.case?.client?.name ?? a.attendance?.clientName ?? null,
      atendimento: a.attendance?.subject ?? null,
      enviadoPor: a.uploadedBy?.name ?? null,
    }));

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      documentos: resumo,
    }));
  } catch (error) {
    console.error("[assistantTools] erro em consultar_documentos:", error);
    return "Não foi possível consultar os documentos agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_tarefas (F6) — as tarefas do escritório, em qualquer status.
//
// Diferente de consultar_agenda (que só olha PRA FRENTE e já exclui CONCLUIDO/CANCELADO, porque
// responde "o que vem por aí"), esta responde "as tarefas", sem recorte de tempo nem de status
// por padrão — inclusive as já concluídas, porque "o que já foi feito" também é uma pergunta
// válida sobre tarefas, e a agenda não responde isso.
// ---------------------------------------------------------------------------

async function executarConsultarTarefas(input: ToolInput, officeId: string): Promise<string> {
  try {
    const status = str(input, "status");
    const tipo = str(input, "tipo");
    const responsavel = str(input, "responsavel");
    const cliente = str(input, "cliente");

    const filtro = {
      officeId,
      status: status || undefined,
      type: tipo || undefined,
      responsible: responsavel ? { name: { contains: responsavel, mode: "insensitive" as const } } : undefined,
      OR: cliente
        ? [
            { case: { client: { name: { contains: cliente, mode: "insensitive" as const } } } },
            { attendance: { clientName: { contains: cliente, mode: "insensitive" as const } } },
          ]
        : undefined,
    };

    const [totalNoBanco, tarefas] = await Promise.all([
      prisma.task.count({ where: filtro }),
      prisma.task.findMany({
        where: filtro,
        include: { case: { include: { client: true } }, attendance: true, responsible: true },
        // Mais recente por vencimento primeiro — o mesmo idioma de "atividade recente" que
        // consultar_processos/consultar_atendimento já usam, e não "o que vem a seguir" (isso é
        // a agenda).
        orderBy: { dueDate: "desc" },
        take: 20,
      }),
    ]);

    const resumo = tarefas.map((t) => ({
      link: linkDaTarefa(t.caseId, t.attendanceId),
      title: t.title,
      type: t.type,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      processo: t.case?.title ?? null,
      cliente: t.case?.client?.name ?? t.attendance?.clientName ?? null,
      responsavel: t.responsible?.name ?? null,
    }));

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      tarefas: resumo,
    }));
  } catch (error) {
    console.error("[assistantTools] erro em consultar_tarefas:", error);
    return "Não foi possível consultar as tarefas agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_assessorias (F6) — as assessorias (contrato mensal com empresa-cliente).
//
// `mensalidade` é dinheiro — o valor contratado do honorário mensal — e por isso passa pela MESMA
// régua do financeiro que o resto da casa usa (REGISTRO: quem tem acesso ao financeiro vê; quem
// não tem recebe a assessoria inteira, sem o valor, com aviso de que foi omitido). A regra do
// dono não fala de "ferramenta financeira", fala de "responder sobre o financeiro" — e mensalidade
// é financeiro, esteja em qual ferramenta estiver.
// ---------------------------------------------------------------------------

async function executarConsultarAssessorias(input: ToolInput, officeId: string, quem: QuemPergunta): Promise<string> {
  try {
    const status = str(input, "status"); // ATIVA | SUSPENSA | ENCERRADA
    const cliente = str(input, "cliente");

    const filtro = {
      officeId,
      status: status || undefined,
      client: cliente ? { name: { contains: cliente, mode: "insensitive" as const } } : undefined,
    };

    const [totalNoBanco, assessorias] = await Promise.all([
      prisma.assessoria.count({ where: filtro }),
      prisma.assessoria.findMany({
        where: filtro,
        include: { client: true, responsible: true },
        orderBy: { startDate: "desc" },
        take: 20,
      }),
    ]);

    const resumo = assessorias.map((a) => ({
      link: linkDaAssessoria(a.id),
      cliente: a.client.name,
      status: a.status,
      iniciadaEm: a.startDate,
      diaDeVencimento: a.dueDay,
      responsavel: a.responsible?.name ?? null,
      // O bloco de dinheiro, sujeito ao corte de REGISTRO — ver comentário acima da função.
      valores: valoresOuOmissao(quem, { mensalidade: a.monthlyFee }),
    }));

    return JSON.stringify(comAviso({
      total: totalNoBanco,
      mostrados: resumo.length,
      truncado: totalNoBanco > resumo.length,
      assessorias: resumo,
    }));
  } catch (error) {
    console.error("[assistantTools] erro em consultar_assessorias:", error);
    return "Não foi possível consultar as assessorias agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_historico_cliente (F6) — "o que já aconteceu com aquele cliente": processos,
// atendimentos, tarefas e documentos vinculados a ele, mais um resumo do que está lançado
// financeiramente em nome dele.
//
// A REGRA DO DONO (Q15), LETRA POR LETRA: o histórico do cliente é REGISTRO em tudo, EXCETO os
// valores de dinheiro dentro dele, que seguem a régua do financeiro — "somar o que já está
// lançado é registro". Por isso só o bloco `financeiro` passa por `valoresOuOmissao`; o resto
// (processos, atendimentos, tarefas, documentos) não tem dinheiro dentro e é visível a qualquer
// um que use o assistente, financeiro ou não.
// ---------------------------------------------------------------------------

async function executarHistoricoCliente(input: ToolInput, officeId: string, quem: QuemPergunta): Promise<string> {
  try {
    const nome = str(input, "nome");
    if (!nome) {
      return "Informe o nome do cliente para consultar o histórico.";
    }

    // Resolve o NOME num cliente só, antes de buscar histórico nenhum — um histórico "do cliente
    // errado" por causa de homônimo é pior do que pedir para a pessoa ser mais específica.
    const candidatos = await prisma.client.findMany({
      where: { officeId, name: { contains: nome, mode: "insensitive" as const } },
      select: { id: true, name: true },
      take: 5,
    });

    if (candidatos.length === 0) {
      return JSON.stringify({ encontrado: false, mensagem: `Nenhum cliente encontrado com o nome "${nome}".` });
    }
    if (candidatos.length > 1) {
      return JSON.stringify({
        encontrado: false,
        ambiguo: true,
        candidatos: candidatos.map((c) => c.name),
        mensagem: "Mais de um cliente encontrado com esse nome — peça para a pessoa ser mais específica (nome completo).",
      });
    }

    const cliente = candidatos[0];
    const apenasPendente = bool(input, "apenasPendente");

    const filtroTarefasEDocumentos = {
      officeId,
      OR: [{ case: { clientId: cliente.id } }, { attendance: { clientId: cliente.id } }],
    };

    // CADA lista traz o TOTAL real, não o tamanho da amostra — a mesma regra do topo do arquivo
    // (AVISO_AMOSTRA): um histórico que mostra 20 processos e diz "total: 20" quando há 60 mente
    // por omissão do mesmo jeito que "não há processo" mentiria.
    const [
      totalProcessos,
      processos,
      totalAtendimentos,
      atendimentos,
      totalTarefas,
      tarefas,
      totalDocumentos,
      documentos,
    ] = await Promise.all([
      prisma.case.count({ where: { officeId, clientId: cliente.id } }),
      prisma.case.findMany({
        where: { officeId, clientId: cliente.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true, status: true, area: true, materias: true, updatedAt: true },
      }),
      prisma.attendance.count({ where: { officeId, clientId: cliente.id } }),
      prisma.attendance.findMany({
        where: { officeId, clientId: cliente.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        // NUNCA `estimatedValue` aqui: é dinheiro, e este bloco (diferente de `financeiro` abaixo)
        // não passa pela régua — mais simples excluir o campo do que lembrar de omiti-lo depois.
        select: { id: true, subject: true, status: true, stage: true, channel: true, createdAt: true },
      }),
      prisma.task.count({ where: filtroTarefasEDocumentos }),
      prisma.task.findMany({
        where: filtroTarefasEDocumentos,
        orderBy: { dueDate: "desc" },
        take: 20,
        select: { id: true, title: true, type: true, status: true, dueDate: true, caseId: true, attendanceId: true },
      }),
      prisma.attachment.count({ where: filtroTarefasEDocumentos }),
      prisma.attachment.findMany({
        where: filtroTarefasEDocumentos,
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, name: true, docType: true, driveUrl: true, createdAt: true },
      }),
    ]);

    // O FINANCEIRO É SEMPRE DO UNIVERSO INTEIRO DO CLIENTE, NUNCA DA AMOSTRA acima (que é só os
    // 20 processos/atendimentos mais recentes). Somar dinheiro sobre uma amostra deu um número
    // errado com cara de certo antes nesta casa (ver o aviso no topo do arquivo) — aqui o filtro é
    // direto no cliente (Receivable.clientId) ou no processo dele (Payable.case.clientId), sem
    // passar pelos ids que vieram na amostra de cima.
    //
    // A consulta só RODA quando `quem` tem acesso — poupa duas agregações a mais quando o
    // resultado vai ser omitido de qualquer forma —, mas quem decide o que SAI é sempre
    // `valoresOuOmissao`, o mesmo portão usado em consultar_assessorias: uma trava, não duas.
    let financeiro: ReturnType<typeof valoresOuOmissao<{ aReceberDesteCliente: unknown; despesasDosProcessosDesteCliente: unknown }>>;
    if (podeVerNivel("registro", quem)) {
      const statusFiltro = apenasPendente ? "PENDENTE" : { not: "A_APURAR" as const };
      const [receberAgg, receberTotal, pagarAgg, pagarTotal] = await Promise.all([
        prisma.receivable.aggregate({
          where: { officeId, clientId: cliente.id, status: statusFiltro },
          _sum: { amount: true, discount: true, surcharge: true },
        }),
        prisma.receivable.count({ where: { officeId, clientId: cliente.id, status: statusFiltro } }),
        prisma.payable.aggregate({
          where: { officeId, case: { clientId: cliente.id }, status: statusFiltro },
          _sum: { amount: true, discount: true, surcharge: true },
        }),
        prisma.payable.count({ where: { officeId, case: { clientId: cliente.id }, status: statusFiltro } }),
      ]);
      financeiro = valoresOuOmissao(quem, {
        aReceberDesteCliente: {
          quantidade: receberTotal,
          somaValores: valorLiquido(receberAgg._sum.amount ?? 0, receberAgg._sum.discount ?? 0, receberAgg._sum.surcharge ?? 0),
        },
        despesasDosProcessosDesteCliente: {
          quantidade: pagarTotal,
          somaValores: valorLiquido(pagarAgg._sum.amount ?? 0, pagarAgg._sum.discount ?? 0, pagarAgg._sum.surcharge ?? 0),
        },
      });
    } else {
      // Sem consulta nenhuma ao banco: `quem.financeiro` já é falso aqui, então `valoresOuOmissao`
      // cai direto na omissão — o valor fictício passado nunca é lido nem devolvido.
      financeiro = valoresOuOmissao(quem, { aReceberDesteCliente: null, despesasDosProcessosDesteCliente: null });
    }

    return JSON.stringify({
      cliente: cliente.name,
      processos: comAviso({
        total: totalProcessos,
        mostrados: processos.length,
        truncado: totalProcessos > processos.length,
        lista: processos.map((c) => ({
          link: linkDoProcesso(c.id),
          title: c.title,
          status: c.status,
          area: c.area,
          materias: c.materias,
          atualizadoEm: c.updatedAt,
        })),
      }),
      atendimentos: comAviso({
        total: totalAtendimentos,
        mostrados: atendimentos.length,
        truncado: totalAtendimentos > atendimentos.length,
        lista: atendimentos.map((a) => ({
          link: linkDoAtendimento(a.id),
          subject: a.subject,
          status: a.status,
          stage: a.stage,
          channel: a.channel,
          criadoEm: a.createdAt,
        })),
      }),
      tarefas: comAviso({
        total: totalTarefas,
        mostrados: tarefas.length,
        truncado: totalTarefas > tarefas.length,
        lista: tarefas.map((t) => ({
          link: linkDaTarefa(t.caseId, t.attendanceId),
          title: t.title,
          type: t.type,
          status: t.status,
          dueDate: t.dueDate,
        })),
      }),
      documentos: comAviso({
        total: totalDocumentos,
        mostrados: documentos.length,
        truncado: totalDocumentos > documentos.length,
        lista: documentos.map((d) => ({
          link: d.driveUrl,
          name: d.name,
          tipo: getDocumentTypeLabel(d.docType),
          criadoEm: d.createdAt,
        })),
      }),
      // O bloco de dinheiro — e SÓ ele — sujeito ao corte de REGISTRO. Quando omitido, o objeto
      // diz `omitido: true` com o motivo por escrito; nunca fica ausente (silêncio) nem mostra o
      // número a quem não tem acesso.
      financeiro,
    });
  } catch (error) {
    console.error("[assistantTools] erro em consultar_historico_cliente:", error);
    return "Não foi possível consultar o histórico deste cliente agora. Tente novamente em instantes.";
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
          estagio: { type: "string", description: "Estágio do funil comercial: NOVO, AGUARDANDO, QUALIFICACAO, PROPOSTA, FECHADO ou PERDIDO." },
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
        "Busca dados cadastrais de um cliente pelo nome, ou lista os clientes do escritório quando nenhum nome for informado. Use quando o usuário perguntar dados de contato, documento ou quantos processos um cliente tem, ou pedir a lista/ficha de clientes do escritório.",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome (ou parte do nome) do cliente a buscar. Deixe vazio para listar os clientes do escritório." },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarBuscarCliente(input, ctx.officeId),
  },
  {
    modulo: "financeiro",
    // REGISTRO: soma o que já está lançado. Continua disponível a quem tem acesso ao financeiro —
    // quem paga as contas precisa saber o que vence amanhã, ou não faz o trabalho.
    nivel: "registro",
    spec: {
      name: "consultar_financeiro",
      description:
        "Busca contas a pagar e/ou a receber do escritório, com totais e lista resumida. Só deve ser usada se o usuário tiver acesso ao módulo Financeiro. Use quando perguntarem sobre valores a pagar/receber, contas pendentes ou totais financeiros. SEMPRE informe `de` e `ate` quando a pergunta mencionar um período (um mês, um trimestre, \"este ano\"): sem eles a resposta cobre todo o histórico e a lista mostrada começa pelos vencimentos mais antigos.",
      input_schema: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["pagar", "receber", "ambos"], description: "Qual tipo de conta consultar." },
          apenasPendente: { type: "boolean", description: "Se true, retorna apenas contas com status PENDENTE." },
          de: {
            type: "string",
            description: 'Início do período de VENCIMENTO. Aceita "2026-09" (o mês inteiro) ou "2026-09-01".',
          },
          ate: {
            type: "string",
            description: 'Fim do período de VENCIMENTO. Aceita "2026-09" (até o último dia do mês) ou "2026-09-30".',
          },
        },
        required: ["tipo"],
      },
    },
    executar: (input, ctx) => executarConsultarFinanceiro(input, ctx.officeId),
  },
  {
    modulo: "financeiro",
    // INDICADOR: não está escrito em lugar nenhum — é produzido. Só sócio.
    nivel: "indicador",
    spec: {
      name: "consultar_indicadores",
      description:
        "Indicadores financeiros do escritório no período: faturamento, despesas, lucro, margem, " +
        "comparação com o período anterior, ticket médio e inadimplência. RESTRITA AOS SÓCIOS — " +
        "quem tem acesso ao financeiro mas não é sócio recebe recusa, e isso é esperado, não é erro. " +
        "Use para perguntas sobre desempenho, resultado, margem, quanto o escritório faturou ou se " +
        "está crescendo. Para contas a pagar/receber e vencimentos, use consultar_financeiro.",
      input_schema: {
        type: "object",
        properties: {
          de: {
            type: "string",
            description: 'Início do período. Aceita "2026-09" (o mês inteiro) ou "2026-09-01". Sem nada, o mês corrente.',
          },
          ate: {
            type: "string",
            description: 'Fim do período, inclusive. Aceita "2026-09" (até o último dia do mês) ou "2026-09-30".',
          },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarConsultarIndicadores(input, ctx.officeId),
  },
  {
    // Módulo próprio ("equipe"), e não "clientes": é gente do escritório, não gente atendida por
    // ele. Nada aqui gira em torno de "financeiro" — a trava desta ferramenta é outra (ver acima).
    modulo: "equipe",
    spec: {
      name: "consultar_equipe",
      description:
        "Lista as pessoas da equipe do escritório: nome, função e se estão na escala de repasse de leads (rodízio do WhatsApp). NUNCA traz telefone nem e-mail — para isso não existe ferramenta. Use quando o usuário perguntar quem trabalha no escritório, a função de alguém, ou quem está na escala.",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome (ou parte do nome) da pessoa a buscar." },
          apenasNaEscala: { type: "boolean", description: "Se true, retorna só quem está na escala de repasse de leads do WhatsApp." },
          incluirInativos: { type: "boolean", description: "Se true, inclui também pessoas inativas (desligadas). Padrão: só ativas." },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarConsultarEquipe(input, ctx.officeId),
  },
  {
    modulo: "atendimento",
    spec: {
      name: "consultar_pendencias",
      description:
        "Busca as pendências do atendimento (Fase 5): o que falta pedir ao lead (SOLICITAR) ou mandar para ele (ENVIAR) para fechar a triagem. Use quando o usuário perguntar o que está faltando, pendente, ou o que falta cobrar de um lead/cliente em atendimento.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", description: "PENDENTE ou CONCLUIDA. Padrão: PENDENTE (só o que ainda está em aberto)." },
          direcao: { type: "string", enum: ["SOLICITAR", "ENVIAR"], description: "SOLICITAR (pedir algo ao lead) ou ENVIAR (mandar algo para ele)." },
          responsavel: { type: "string", description: "Nome (ou parte do nome) do responsável pela pendência." },
          somenteVencidas: { type: "boolean", description: "Se true, retorna só as pendências com prazo já vencido." },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarConsultarPendencias(input, ctx.officeId),
  },
  {
    modulo: "documentos",
    spec: {
      name: "consultar_documentos",
      description:
        "Busca documentos/anexos do escritório (processos, atendimentos e licitações), com o link do Drive para abrir o arquivo. Use quando o usuário perguntar por um documento, anexo, contrato ou petição já enviada/anexada.",
      input_schema: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome (ou parte do nome) do cliente dono do processo/atendimento do documento." },
          tipo: { type: "string", description: "Tipo do documento (ver catálogo do escritório, ex: CONTRATO, PETICAO_INICIAL, PROCURACAO)." },
          diasAtras: { type: "integer", description: "Só documentos enviados nos últimos N dias. Sem isto, não há recorte de data." },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarConsultarDocumentos(input, ctx.officeId),
  },
  {
    // Módulo próprio ("tarefas"), distinto de "agenda": a agenda só olha pra frente e exclui o
    // que já foi concluído/cancelado; esta ferramenta responde sobre QUALQUER tarefa.
    modulo: "tarefas",
    spec: {
      name: "consultar_tarefas",
      description:
        "Busca tarefas do escritório em qualquer status (inclusive já concluídas ou canceladas), por tipo, responsável ou cliente. Use para perguntas sobre tarefas em geral — o que já foi feito, quantas tarefas um responsável tem, etc. Para o que está PELA FRENTE na agenda (prazos, audiências futuras), use consultar_agenda.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", description: "PENDENTE, EM_ANDAMENTO, CONCLUIDO ou CANCELADO." },
          tipo: { type: "string", description: "TAREFA, EVENTO, AUDIENCIA, PERICIA ou PRAZO." },
          responsavel: { type: "string", description: "Nome (ou parte do nome) do responsável." },
          cliente: { type: "string", description: "Nome (ou parte do nome) do cliente do processo/atendimento da tarefa." },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarConsultarTarefas(input, ctx.officeId),
  },
  {
    modulo: "assessorias",
    spec: {
      name: "consultar_assessorias",
      description:
        "Busca as assessorias (contrato mensal de honorário com empresa-cliente) do escritório. O valor da mensalidade só aparece para quem tem acesso ao financeiro do escritório — para quem não tem, vem omitido com aviso, nunca em silêncio. Use quando o usuário perguntar sobre assessorias ativas, honorário mensal de uma empresa, ou vencimento da assessoria.",
      input_schema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ATIVA", "SUSPENSA", "ENCERRADA"], description: "Status da assessoria." },
          cliente: { type: "string", description: "Nome (ou parte do nome) da empresa-cliente." },
        },
        required: [],
      },
    },
    executar: (input, ctx) => executarConsultarAssessorias(input, ctx.officeId, { financeiro: ctx.financeiro ?? false, admin: ctx.admin ?? false }),
  },
  {
    // NÃO é módulo "financeiro": a ferramenta inteira é oferecida a qualquer usuário do
    // escritório (é REGISTRO de cliente, não financeiro) — só o bloco `financeiro` da resposta é
    // que passa pela régua, por dentro da própria função. Ver o comentário de
    // executarHistoricoCliente para a regra completa (Q15 da entrevista do dono).
    modulo: "clientes",
    spec: {
      name: "consultar_historico_cliente",
      description:
        "Traz o histórico completo de um cliente: processos, atendimentos, tarefas e documentos vinculados a ele, mais um resumo financeiro (contas a receber dele e despesas dos processos dele). Os VALORES financeiros só aparecem para quem tem acesso ao financeiro do escritório — para quem não tem, vêm omitidos com aviso explícito, nunca em silêncio e nunca com o número. Use quando o usuário perguntar 'o que já aconteceu com' um cliente, o histórico dele, ou um resumo geral de um cliente específico.",
      input_schema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome (o mais completo possível) do cliente." },
          apenasPendente: { type: "boolean", description: "Se true, o resumo financeiro considera só o que ainda está PENDENTE." },
        },
        required: ["nome"],
      },
    },
    executar: (input, ctx) => executarHistoricoCliente(input, ctx.officeId, { financeiro: ctx.financeiro ?? false, admin: ctx.admin ?? false }),
  },
];
