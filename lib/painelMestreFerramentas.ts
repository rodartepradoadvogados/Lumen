import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { PlatformViewer } from "@/lib/platformMember";
import { alcancaNivel, motivoNivelInsuficiente, type NivelDeVisibilidade } from "@/lib/painelMestreVisibilidade";
import type { NivelFinanceiro, QuemPergunta } from "@/lib/nivelFinanceiro";
import { podeVerNivel, motivoDaRecusa, explicacaoDaRecusa } from "@/lib/nivelFinanceiro";
import { getActiveSupportSession } from "@/lib/supportAccess";
import { maskReadResult } from "@/lib/supportMaskingApply";
import { situacaoDoProvisionamento } from "@/lib/provisionamentoCampanhas";
import { lerData } from "@/lib/assistantTools";

// ============================================================================
// AS FERRAMENTAS DO AGENTE DO PAINEL MESTRE (F7) — perguntas operacionais da EQUIPE DA LÚMEN
// sobre a máquina da plataforma: quantos escritórios estão inadimplentes, qual perfil do Hermes
// falhou, quantas campanhas aguardam aprovação. Este arquivo é o irmão de lib/assistantTools.ts
// (F6) — mesmo desenho, público diferente: aqui quem pergunta é gente da Lúmen, não do escritório
// cliente, e o "escritório" pode aparecer como ASSUNTO da pergunta, nunca como identidade de quem
// pergunta.
//
// AS TRÊS LEIS, e onde cada uma mora:
//
//   LEI 1 — HERDA A CREDENCIAL. Não existe "usuário do agente" com acesso privilegiado. Toda
//   ferramenta declara `nivelVisibilidade` (a escada de lib/painelMestreVisibilidade.ts) e
//   `ferramentaLiberada` decide se o PlatformViewer de quem perguntou alcança ali — a MESMA
//   checagem que decide o que oferecer ao modelo e o que barrar de novo na execução (dupla
//   checagem, o mesmo padrão de app/api/agente/ferramentas/route.ts para o financeiro).
//
//   LEI 2 — NÃO ENXERGA ATRAVÉS DE UMA SESSÃO DE VIDRO-FOSCO ABERTA. Só uma ferramenta aqui olha
//   para DENTRO de um escritório específico (`consultar_atividade_do_escritorio`) — e mesmo com
//   uma AccessSession ativa autorizando a pergunta, o retorno passa por `maskReadResult` (o MESMO
//   motor que já mascara toda tela do produto, lib/supportMaskingApply.ts) antes de sair. Não é
//   uma segunda implementação da máscara: é o mesmo motor, chamado explicitamente aqui — porque
//   este agente pode responder de uma rota que não necessariamente carrega o cookie de "atuar
//   como" que a extensão do Prisma lê sozinha (lib/supportContext.ts), e a lei não pode depender
//   de um acidente de qual rota levou o cookie junto.
//
//   LEI 3 — SÓ LEITURA. Nenhuma ferramenta aqui chama create/update/upsert/delete/updateMany/
//   deleteMany do Prisma. A varredura que prova isso mora em lib/testes/painelMestreAgente.teste.ts.
//
// A RÉGUA FINANCEIRA (Q15) TAMBÉM VALE AQUI, com o equivalente do "administrador" do escritório
// sendo `PlatformRole.canManageBilling` no Painel Mestre — não um papel novo. `financeiro: true`
// sempre, para quem já é PlatformMember ativo (cuidar da cobrança da plataforma é literalmente
// o trabalho da equipe da Lúmen; não existe aqui o equivalente de "colaborador sem acesso ao
// financeiro" que existe dentro de um escritório-cliente) — só o corte REGISTRO/INDICADOR muda
// com `canManageBilling`. Reaproveita lib/nivelFinanceiro.ts inteiro: `podeVerNivel`,
// `motivoDaRecusa`, `explicacaoDaRecusa`, `valoresOuOmissao` — nada disso é reimplementado.
// ============================================================================

export type ToolInput = Record<string, unknown>;

export type PainelMestreTool = {
  /** A escada de lib/painelMestreVisibilidade.ts — o nível mínimo que esta ferramenta exige. */
  nivelVisibilidade: NivelDeVisibilidade;
  /**
   * Presente só nas duas ferramentas de cobrança da PLATAFORMA — o mesmo par REGISTRO/INDICADOR
   * de lib/nivelFinanceiro.ts, só que sobre a receita da Lúmen (mensalidade dos escritórios-
   * clientes), não sobre o financeiro de um escritório. Ausente nas demais, onde a distinção
   * não existe — mesma convenção de AssistantTool.nivel em lib/assistantTools.ts.
   */
  nivel?: NivelFinanceiro;
  /**
   * true só na ferramenta que exige uma AccessSession de suporte ATIVA para responder (hoje,
   * só consultar_atividade_do_escritorio). lib/painelMestreConversas.ts usa isto — via
   * FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE, abaixo — para decidir o que é seguro sobreviver
   * no histórico gravado: LEI 2, uma resposta obtida através de uma sessão de suporte não pode
   * ser relida depois que ela fechar, como se o acesso ainda valesse. Marcar aqui (em vez de
   * checar `nivelVisibilidade !== "ABERTO"`) é deliberado — o teto de visibilidade e "esta
   * ferramenta consultou algo que dependeu de uma sessão aberta" são dois conceitos diferentes
   * que hoje coincidem numa ferramenta só, mas não precisam sempre coincidir.
   */
  exigeSessaoDeSuporte?: boolean;
  spec: Anthropic.Tool;
  executar: (input: ToolInput, viewer: PlatformViewer) => Promise<string>;
};

/**
 * Esta pessoa pode usar esta ferramenta? UMA função, usada pela lista oferecida ao modelo E pela
 * execução — o mesmo cuidado do comentário de `liberada` em app/api/agente/ferramentas/route.ts:
 * uma trava que só existe num dos dois lugares não é uma trava.
 */
export function ferramentaLiberada(tool: PainelMestreTool, viewer: PlatformViewer): boolean {
  if (!alcancaNivel(viewer.maxVisibility, tool.nivelVisibilidade)) return false;
  if (tool.nivel) return podeVerNivel(tool.nivel, quemPerguntaDaPlataforma(viewer));
  return true;
}

/** A dupla financeiro/admin da plataforma — ver o comentário grande no topo do arquivo. */
export function quemPerguntaDaPlataforma(viewer: PlatformViewer): QuemPergunta {
  return { financeiro: true, admin: viewer.canManageBilling };
}

/** Por que esta ferramenta foi recusada — texto único para a auditoria e para a resposta ao agente. */
export function motivoDaRecusaDaFerramenta(tool: PainelMestreTool, viewer: PlatformViewer): string {
  if (!alcancaNivel(viewer.maxVisibility, tool.nivelVisibilidade)) return motivoNivelInsuficiente(tool.nivelVisibilidade);
  if (tool.nivel) return motivoDaRecusa(tool.nivel, quemPerguntaDaPlataforma(viewer)) ?? "sem permissão";
  return "sem permissão";
}

/** A explicação em português que vai para quem perguntou. */
export function explicacaoDaRecusaDaFerramenta(tool: PainelMestreTool, viewer: PlatformViewer): string {
  if (!alcancaNivel(viewer.maxVisibility, tool.nivelVisibilidade)) return motivoNivelInsuficiente(tool.nivelVisibilidade);
  if (tool.nivel) return explicacaoDaRecusa(tool.nivel, quemPerguntaDaPlataforma(viewer));
  return "Consulta não autorizada.";
}

// ---------------------------------------------------------------------------
// Pequenos leitores de entrada — mesmíssimo padrão de lib/assistantTools.ts, copiado (não
// importado) porque são funções de três linhas: importar de lá para reusar isto criaria um
// acoplamento entre os dois catálogos de ferramentas maior que o valor de não repetir 3 linhas.
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function bool(input: ToolInput, key: string): boolean {
  return input[key] === true;
}

// ---------------------------------------------------------------------------
// consultar_escritorios — ABERTO. Nunca olha para DENTRO de um escritório (nenhum processo,
// cliente ou atendimento): só os campos do próprio Office/TenantInvoice, que são a relação
// COMERCIAL da Lúmen com o tenant — dado deliberadamente não mascarado (ver
// lib/supportMaskingMap.ts:DELIBERATELY_UNMASKED_MODELS, comentário de "Office"/"TenantInvoice").
// ---------------------------------------------------------------------------

async function executarConsultarEscritorios(input: ToolInput): Promise<string> {
  try {
    const nome = str(input, "nome");
    const agora = new Date();

    const filtro = { isInternal: false, name: nome ? { contains: nome, mode: "insensitive" as const } : undefined };

    const [porStatus, comFaturaVencida, escritorios] = await Promise.all([
      prisma.office.groupBy({ by: ["status"], where: filtro, _count: { _all: true } }),
      // DISTINCT por officeId: um escritório com duas faturas vencidas conta uma vez só — a
      // pergunta é "quantos escritórios", não "quantas faturas".
      prisma.tenantInvoice.findMany({
        where: { status: "PENDENTE", dueDate: { lt: agora }, office: filtro },
        select: { officeId: true },
        distinct: ["officeId"],
      }),
      prisma.office.findMany({
        where: filtro,
        select: { id: true, name: true, slug: true, status: true, billingEmail: true, createdAt: true },
        orderBy: { name: "asc" },
        take: 30,
      }),
    ]);

    const totalNoBanco = escritorios.length === 30 ? await prisma.office.count({ where: filtro }) : escritorios.length;

    return JSON.stringify({
      totais: {
        porStatus: Object.fromEntries(porStatus.map((p) => [p.status, p._count._all])),
        comFaturaVencidaEmAberto: comFaturaVencida.length,
      },
      total: totalNoBanco,
      mostrados: escritorios.length,
      truncado: totalNoBanco > escritorios.length,
      escritorios: escritorios.map((o) => ({
        nome: o.name,
        slug: o.slug,
        status: o.status,
        semEmailDeCobranca: !o.billingEmail,
        clienteDesde: o.createdAt,
      })),
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_escritorios:", error);
    return "Não foi possível consultar os escritórios agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_saude_do_hermes — ABERTO. "Qual perfil do Hermes falhou" — estado do provisionamento
// do módulo de campanhas por escritório (PerfilCampanhaHermes), reaproveitando a MESMA função
// pura que a Frente D usaria na tela (lib/provisionamentoCampanhas.ts:situacaoDoProvisionamento).
// Sem dado de cliente aqui dentro: é o estado da MÁQUINA, não do conteúdo que ela atende.
// ---------------------------------------------------------------------------

async function executarConsultarSaudeDoHermes(input: ToolInput): Promise<string> {
  try {
    const apenasComProblema = input.apenasComProblema !== false; // padrão: só o que precisa de atenção

    const perfis = await prisma.perfilCampanhaHermes.findMany({
      where: apenasComProblema ? { OR: [{ provisionamentoFalhouDefinitivamente: true }, { precisaReprovisionar: true }] } : undefined,
      include: { assinatura: { include: { office: { select: { name: true, slug: true } } } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });

    const resumo = perfis.map((p) => ({
      escritorio: p.assinatura.office.name,
      situacao: situacaoDoProvisionamento({
        estaProvisionado: p.estado === "PROVISIONADO" && !p.precisaReprovisionar,
        precisaReprovisionar: p.precisaReprovisionar,
        numeroDeTentativas: p.numeroDeTentativasDeProvisionamento,
        falhouDefinitivamente: p.provisionamentoFalhouDefinitivamente,
        ultimoErro: p.ultimoErroDeProvisionamento,
      }),
    }));

    return JSON.stringify({
      total: resumo.length,
      truncado: resumo.length === 30,
      perfis: resumo,
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_saude_do_hermes:", error);
    return "Não foi possível consultar a saúde do Hermes agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_campanhas_pendentes — ABERTO. CampanhaSlotPago em estado SOLICITADO: pedidos de
// slot extra ainda sem decisão do Painel Mestre (ver lib/aprovacaoDeCampanha.ts para QUEM pode
// decidir — esta ferramenta só CONTA e LISTA, nunca decide).
// ---------------------------------------------------------------------------

async function executarConsultarCampanhasPendentes(): Promise<string> {
  try {
    const pendentes = await prisma.campanhaSlotPago.findMany({
      where: { estado: "SOLICITADO" },
      include: { office: { select: { name: true } }, campanha: { select: { nome: true } } },
      orderBy: { solicitadoEm: "asc" },
      take: 30,
    });

    const total = await prisma.campanhaSlotPago.count({ where: { estado: "SOLICITADO" } });

    return JSON.stringify({
      total,
      mostrados: pendentes.length,
      truncado: total > pendentes.length,
      pendentes: pendentes.map((s) => ({
        escritorio: s.office.name,
        campanha: s.campanha.nome,
        solicitadoEm: s.solicitadoEm,
      })),
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_campanhas_pendentes:", error);
    return "Não foi possível consultar as campanhas pendentes agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_equipe_da_lumen — ABERTO. PlatformMember é modelo deliberadamente NÃO mascarado
// (lib/supportMaskingMap.ts) — é a própria equipe da plataforma, não dado de cliente.
// ---------------------------------------------------------------------------

async function executarConsultarEquipeDaLumen(input: ToolInput): Promise<string> {
  try {
    const incluirInativos = bool(input, "incluirInativos");

    const membros = await prisma.platformMember.findMany({
      where: incluirInativos ? undefined : { active: true },
      include: { role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    return JSON.stringify({
      total: membros.length,
      equipe: membros.map((m) => ({
        nome: m.user?.name ?? m.name ?? "(sem nome)",
        papel: m.role.name,
        ativo: m.active,
      })),
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_equipe_da_lumen:", error);
    return "Não foi possível consultar a equipe da Lúmen agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_cobranca_dos_escritorios — REGISTRO. O que já está lançado sobre a cobrança dos
// escritórios-clientes (TenantInvoice): contagens e somas por status e período de vencimento.
// Mesmo `lerData` de lib/assistantTools.ts, reaproveitado — não reimplementado.
// ---------------------------------------------------------------------------

async function executarConsultarCobrancaDosEscritorios(input: ToolInput): Promise<string> {
  try {
    const de = lerData(str(input, "de"), false);
    const ate = lerData(str(input, "ate"), true);
    const porVencimento = de || ate ? { dueDate: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {};

    const [porStatus, somaPorStatus] = await Promise.all([
      prisma.tenantInvoice.groupBy({ by: ["status"], where: porVencimento, _count: { _all: true } }),
      prisma.tenantInvoice.groupBy({ by: ["status"], where: porVencimento, _sum: { amount: true } }),
    ]);

    const somaPorStatusMapa = Object.fromEntries(somaPorStatus.map((s) => [s.status, s._sum.amount ?? 0]));

    return JSON.stringify({
      periodo: de || ate
        ? { de: de ? de.toISOString().slice(0, 10) : null, ate: ate ? ate.toISOString().slice(0, 10) : null }
        : "todo o histórico",
      porStatus: Object.fromEntries(
        porStatus.map((p) => [p.status, { quantidade: p._count._all, somaValores: somaPorStatusMapa[p.status] ?? 0 }]),
      ),
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_cobranca_dos_escritorios:", error);
    return "Não foi possível consultar a cobrança dos escritórios agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_indicadores_da_plataforma — INDICADOR. Não está lançado em lugar nenhum — é
// produzido a partir do que está lançado (MRR, crescimento). Só canManageBilling, mesma régua.
// ---------------------------------------------------------------------------

async function executarConsultarIndicadoresDaPlataforma(): Promise<string> {
  try {
    const agora = new Date();
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const inicioDoMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);

    const [assinaturasAtivas, novasNoMes, canceladasNoMes] = await Promise.all([
      prisma.subscription.findMany({ where: { status: "ATIVA", internal: false }, select: { monthlyFee: true } }),
      prisma.subscription.count({ where: { internal: false, startedAt: { gte: inicioDoMes } } }),
      prisma.subscription.count({ where: { internal: false, canceledAt: { gte: inicioDoMes } } }),
    ]);
    const canceladasNoMesAnterior = await prisma.subscription.count({
      where: { internal: false, canceledAt: { gte: inicioDoMesAnterior, lt: inicioDoMes } },
    });

    const mrr = assinaturasAtivas.reduce((soma, s) => soma + s.monthlyFee, 0);

    return JSON.stringify({
      mrr: Math.round(mrr * 100) / 100,
      escritoriosAtivos: assinaturasAtivas.length,
      novosEsteMes: novasNoMes,
      canceladosEsteMes: canceladasNoMes,
      canceladosNoMesAnterior: canceladasNoMesAnterior,
      comoEsteNumeroEApurado:
        "MRR é a soma da mensalidade (Subscription.monthlyFee) de toda assinatura com status ATIVA, sem contar o escritório interno do Rodarte Prado.",
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_indicadores_da_plataforma:", error);
    return "Não foi possível apurar os indicadores da plataforma agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// consultar_atividade_do_escritorio — VIDRO_FOSCO. A ÚNICA ferramenta deste agente que olha para
// DENTRO de um escritório específico — e por isso a única onde as duas leis (1 e 2) se cruzam.
//
// LEI 1, aplicada duas vezes de propósito (mesmo espírito do financeiro em
// app/api/agente/ferramentas/route.ts): o NÍVEL da pessoa (`viewer.maxVisibility`) precisa
// alcançar VIDRO_FOSCO — checado por `ferramentaLiberada` antes de oferecer a ferramenta, e DE
// NOVO aqui dentro. E, além do papel, precisa existir uma AccessSession ATIVA para ESTE
// escritório — a MESMA trava que decide se a TELA mostra qualquer coisa dele (lib/supportAccess.ts
// :getActiveSupportSession, reaproveitada, não reimplementada). Sem sessão aberta para aquele
// escritório, ninguém — nem sócio — vê nada daqui: é exatamente o que "se a pessoa não enxerga
// pela tela, o agente não pode contar" exige, porque sem sessão a TELA também não mostra nada.
//
// LEI 2: mesmo com a sessão aberta e autorizando a pergunta, os títulos de processo que saem
// daqui passam por `maskReadResult("Case", ...)` — o MESMO motor de lib/supportMaskingApply.ts
// que já mascara toda tela do produto. Contagens (quantos processos, quantos atendimentos) NÃO
// são mascaradas de propósito: um número não identifica ninguém (mesmo critério do comentário de
// SUPPORT_MASK_MAP sobre contadores) e é exatamente o tipo de coisa que o suporte precisa
// diagnosticar. Título de processo, sim: é teor.
// ---------------------------------------------------------------------------

async function executarConsultarAtividadeDoEscritorio(input: ToolInput, viewer: PlatformViewer): Promise<string> {
  try {
    // Defesa em profundidade — ver o comentário acima. `ferramentaLiberada` já barrou isto antes
    // de a ferramenta ser oferecida ao modelo; aqui é a segunda porta, para o dia em que alguém
    // mexer na primeira sem pensar.
    if (!alcancaNivel(viewer.maxVisibility, "VIDRO_FOSCO")) {
      return JSON.stringify({ recusado: true, motivo: motivoNivelInsuficiente("VIDRO_FOSCO") });
    }

    const nome = str(input, "escritorio");
    if (!nome) return "Informe o nome do escritório.";

    const candidatos = await prisma.office.findMany({
      where: { name: { contains: nome, mode: "insensitive" as const } },
      select: { id: true, name: true },
      take: 5,
    });
    if (candidatos.length === 0) {
      return JSON.stringify({ encontrado: false, mensagem: `Nenhum escritório encontrado com o nome "${nome}".` });
    }
    if (candidatos.length > 1) {
      return JSON.stringify({
        encontrado: false,
        ambiguo: true,
        candidatos: candidatos.map((c) => c.name),
        mensagem: "Mais de um escritório encontrado com esse nome — peça para ser mais específico.",
      });
    }
    const office = candidatos[0];

    // A TRAVA DA LEI 1 PARA ESTE ESCRITÓRIO ESPECÍFICO: sem sessão de suporte ativa aberta para
    // ELE, a resposta é uma OMISSÃO FALADA — nunca um número, nunca silêncio.
    const sessao = await getActiveSupportSession(office.id);
    if (!sessao) {
      return JSON.stringify({
        recusado: true,
        motivo: `Não há sessão de suporte ativa aberta para "${office.name}". Abra uma sessão (Painel Mestre → escritório → "Atuar como") antes de perguntar sobre o conteúdo dele.`,
      });
    }

    const [totalProcessos, totalAtendimentosAbertos, totalTarefasPendentes, casosRecentes] = await Promise.all([
      prisma.case.count({ where: { officeId: office.id, status: { notIn: ["ENCERRADO", "ARQUIVADO"] } } }),
      prisma.attendance.count({ where: { officeId: office.id, status: { notIn: ["CONVERTIDO", "ARQUIVADO"] } } }),
      prisma.task.count({ where: { officeId: office.id, status: { notIn: ["CONCLUIDO", "CANCELADO"] } } }),
      prisma.case.findMany({
        where: { officeId: office.id },
        select: { id: true, title: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    // LEI 2, LITERAL: mesmo com a sessão aberta autorizando a pergunta, o TEOR (título do
    // processo) sai mascarado — o teste que prova isto está em
    // lib/testes/painelMestreAgente.teste.ts e falha se esta linha for removida.
    const casosMascarados = maskReadResult("Case", casosRecentes) as typeof casosRecentes;

    return JSON.stringify({
      escritorio: office.name,
      sessaoDeSuporte: { abertaPor: sessao.memberName, desde: sessao.startedAt },
      processosAtivos: totalProcessos,
      atendimentosAbertos: totalAtendimentosAbertos,
      tarefasPendentes: totalTarefasPendentes,
      // "Vidro Fosco": título e demais campos de teor vêm redigidos, mesmo dentro da sessão
      // aberta — id, status e data de atualização não identificam ninguém e continuam visíveis.
      processosRecentes: casosMascarados.map((c) => ({ id: c.id, titulo: c.title, status: c.status, atualizadoEm: c.updatedAt })),
    });
  } catch (error) {
    console.error("[painelMestreFerramentas] erro em consultar_atividade_do_escritorio:", error);
    return "Não foi possível consultar a atividade deste escritório agora. Tente novamente em instantes.";
  }
}

// ---------------------------------------------------------------------------
// Registro de ferramentas
// ---------------------------------------------------------------------------

export const painelMestreFerramentas: PainelMestreTool[] = [
  {
    nivelVisibilidade: "ABERTO",
    spec: {
      name: "consultar_escritorios",
      description:
        "Lista os escritórios-clientes da Lúmen com status (ATIVA/SUSPENSA/CANCELADA) e quantos têm fatura vencida em aberto. Use para perguntas sobre quantos escritórios existem, quantos estão inadimplentes, ou o status comercial de um escritório específico.",
      input_schema: {
        type: "object",
        properties: { nome: { type: "string", description: "Nome (ou parte do nome) do escritório a buscar." } },
        required: [],
      },
    },
    executar: (input) => executarConsultarEscritorios(input),
  },
  {
    nivelVisibilidade: "ABERTO",
    spec: {
      name: "consultar_saude_do_hermes",
      description:
        "Lista o estado do provisionamento do perfil do Hermes (módulo de campanhas) por escritório: se está no ar, tentando de novo, ou falhou definitivamente, com o motivo. Use quando perguntarem qual perfil do Hermes falhou, ou o estado do provisionamento de campanhas.",
      input_schema: {
        type: "object",
        properties: {
          apenasComProblema: {
            type: "boolean",
            description: "Padrão true: só perfis com pendência ou falha. Passe false para ver todos, inclusive os que estão no ar.",
          },
        },
        required: [],
      },
    },
    executar: (input) => executarConsultarSaudeDoHermes(input),
  },
  {
    nivelVisibilidade: "ABERTO",
    spec: {
      name: "consultar_campanhas_pendentes",
      description:
        "Lista os pedidos de slot pago de campanha ainda sem decisão (estado SOLICITADO), com o escritório e a campanha. Use para perguntas sobre quantas campanhas aguardam aprovação.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    executar: () => executarConsultarCampanhasPendentes(),
  },
  {
    nivelVisibilidade: "ABERTO",
    spec: {
      name: "consultar_equipe_da_lumen",
      description: "Lista a equipe da Lúmen (PlatformMember): nome, papel e se está ativo. Use quando perguntarem quem está na equipe da plataforma.",
      input_schema: {
        type: "object",
        properties: { incluirInativos: { type: "boolean", description: "Se true, inclui também membros desativados." } },
        required: [],
      },
    },
    executar: (input) => executarConsultarEquipeDaLumen(input),
  },
  {
    nivelVisibilidade: "ABERTO",
    nivel: "registro",
    spec: {
      name: "consultar_cobranca_dos_escritorios",
      description:
        "Contagens e somas das faturas de mensalidade dos escritórios (TenantInvoice) por status, com período opcional de vencimento. Use para perguntas sobre quanto está pendente/pago/cancelado de cobrança dos escritórios.",
      input_schema: {
        type: "object",
        properties: {
          de: { type: "string", description: 'Início do período de vencimento. Aceita "2026-09" ou "2026-09-01".' },
          ate: { type: "string", description: 'Fim do período de vencimento. Aceita "2026-09" ou "2026-09-30".' },
        },
        required: [],
      },
    },
    executar: (input) => executarConsultarCobrancaDosEscritorios(input),
  },
  {
    nivelVisibilidade: "ABERTO",
    nivel: "indicador",
    spec: {
      name: "consultar_indicadores_da_plataforma",
      description:
        "Indicadores da PRÓPRIA Lúmen (não de um escritório-cliente): MRR, escritórios ativos, novos e cancelados no mês. RESTRITA a quem administra a cobrança da plataforma (PlatformRole.canManageBilling) — quem não tem essa permissão recebe recusa, e isso é esperado.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    executar: () => executarConsultarIndicadoresDaPlataforma(),
  },
  {
    nivelVisibilidade: "VIDRO_FOSCO",
    exigeSessaoDeSuporte: true,
    spec: {
      name: "consultar_atividade_do_escritorio",
      description:
        "Contagens de processos/atendimentos/tarefas e uma lista curta dos processos mais recentes de UM escritório específico. Só funciona quando há uma sessão de suporte ATIVA aberta para aquele escritório — sem ela, a resposta é uma recusa explicando o que fazer. O título dos processos vem sempre redigido (Vidro Fosco), mesmo dentro da sessão.",
      input_schema: {
        type: "object",
        properties: { escritorio: { type: "string", description: "Nome do escritório." } },
        required: ["escritorio"],
      },
    },
    executar: (input, viewer) => executarConsultarAtividadeDoEscritorio(input, viewer),
  },
];

/**
 * Os nomes das ferramentas marcadas `exigeSessaoDeSuporte` — hoje só uma, mas calculado do
 * REGISTRO (não escrito à mão) para que uma futura ferramenta marcada assim entre na lista
 * automaticamente. Consumido por lib/painelMestreConversas.ts para a Lei 2 (ver o comentário
 * grande daquele arquivo).
 */
export const FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE: readonly string[] = painelMestreFerramentas
  .filter((tool) => tool.exigeSessaoDeSuporte)
  .map((tool) => tool.spec.name);
