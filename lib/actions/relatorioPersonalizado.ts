"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { naturezaOf, NATUREZA_LABELS } from "@/lib/caseNatureza";
import { composeDocumentTypeGroups, getDocumentTypeLabel, type OfficeDocumentTypeEntry } from "@/lib/documentTypes";
import {
  SEM_ASSESSORIA,
  SEM_RESPONSAVEL,
  dimensaoAtiva,
  tiposDosGrupos,
  type Contagem,
  type FiltroInexistente,
  type LinhaAgregada,
  type LinhaDetalhe,
  type ModeloSalvo,
  type OpcoesRelatorio,
  type Origem,
  type RelatorioFiltros,
  type RelatorioResultado,
} from "@/lib/relatorioPersonalizado";

// Teto de linhas devolvidas no detalhamento. O total real continua sendo informado em
// `detalhesTotal` — a tela mostra "mostrando 300 de 1.240" em vez de fingir que são 300.
const TETO_DETALHE = 300;

const TIPO_COMPROMISSO_LABEL: Record<string, string> = {
  TAREFA: "Tarefa",
  EVENTO: "Evento",
  AUDIENCIA: "Audiência",
  PERICIA: "Perícia",
  PRAZO: "Prazo",
};

// ---------------------------------------------------------------------------
// Opções dos filtros
// ---------------------------------------------------------------------------

export async function listarOpcoes(): Promise<OpcoesRelatorio> {
  const user = await getCurrentUser();
  if (!user) return { assessorias: [], usuarios: [], gruposPeca: [] };

  const [assessorias, usuarios, officeTypes] = await Promise.all([
    prisma.assessoria.findMany({
      where: { officeId: user.officeId },
      select: { id: true, client: { select: { name: true } } },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.user.findMany({
      where: { officeId: user.officeId, active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    carregarOfficeTypes(user.officeId),
  ]);

  return {
    assessorias: assessorias.map((a) => ({ id: a.id, nome: a.client.name })),
    usuarios: usuarios.map((u) => ({ id: u.id, nome: u.name, cor: u.color })),
    gruposPeca: composeDocumentTypeGroups(officeTypes).map((g) => g.group),
  };
}

async function carregarOfficeTypes(officeId: string): Promise<OfficeDocumentTypeEntry[]> {
  const tipos = await prisma.officeDocumentType.findMany({
    where: { officeId, ativo: true },
    select: { chave: true, rotulo: true, secao: true },
  });
  return tipos;
}

// ---------------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------------

// Item já normalizado: seja peça, compromisso, processo, atendimento ou demanda, toda apuração
// passa a enxergar as MESMAS quatro dimensões. É o que permite aplicar os filtros de origem,
// assessoria e responsável uma única vez, em vez de reescrever a regra para cada entidade.
type ItemNormalizado = {
  id: string;
  especie: "PECA" | "COMPROMISSO" | "PROCESSO" | "ATENDIMENTO" | "DEMANDA" | "PUBLICACAO";
  nome: string;
  tipoLabel: string;
  data: Date;
  origem: Origem;
  assessoriaId: string | null;
  assessoriaNome: string | null;
  // Quem executou o ato (anexou o arquivo / concluiu o compromisso) e quem é o dono da pasta.
  // Guardamos SEMPRE os dois: o dono do escritório validou que a tela mostra as duas colunas,
  // e o agrupamento escolhe qual deles vira o eixo (ver `creditoDe`).
  executorId: string | null;
  executorNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  driveUrl?: string;
  href?: string;
  // É audiência? Alimenta o bloco próprio de "Audiências realizadas".
  audiencia?: boolean;
};

function limites(filtros: RelatorioFiltros) {
  const inicio = new Date(`${filtros.de}T00:00:00`);
  const fimBruto = new Date(`${filtros.ate}T00:00:00`);
  const fim = new Date(fimBruto.getTime() + 24 * 60 * 60 * 1000); // `ate` é inclusivo
  const duracao = fim.getTime() - inicio.getTime();
  const anteriorFim = inicio;
  const anteriorInicio = new Date(inicio.getTime() - duracao);
  return { inicio, fim, anteriorInicio, anteriorFim };
}

// Regra central: dimensão sem nenhum valor marcado não filtra (ver lib/relatorioPersonalizado.ts).
function passaDimensao(valores: string[], valorDoItem: string | null, chaveVazio: string): boolean {
  if (!dimensaoAtiva(valores)) return true;
  if (valorDoItem === null) return valores.includes(chaveVazio);
  return valores.includes(valorDoItem);
}

function passaOrigem(origens: Origem[], origem: Origem): boolean {
  if (origens.length === 0) return true;
  return origens.includes(origem);
}

// Qual das duas atribuições vira o eixo de "por pessoa", conforme o critério escolhido na tela.
function creditoDe(item: ItemNormalizado, criterio: RelatorioFiltros["criterioAutoria"]) {
  if (criterio === "RESPONSAVEL") return { id: item.responsavelId, nome: item.responsavelNome };
  // ANEXOU cai no responsável quando não há executor registrado (ex.: compromisso ainda não
  // concluído, apurado pela data de vencimento) — melhor creditar o dono da pasta do que jogar
  // o item inteiro em "Sem responsável" e sumir com ele do ranking.
  return { id: item.executorId ?? item.responsavelId, nome: item.executorNome ?? item.responsavelNome };
}

async function coletar(
  officeId: string,
  filtros: RelatorioFiltros,
  inicio: Date,
  fim: Date,
  officeTypes: OfficeDocumentTypeEntry[]
): Promise<ItemNormalizado[]> {
  const querContar = (c: Contagem) => filtros.contar.length === 0 || filtros.contar.includes(c);
  const itens: ItemNormalizado[] = [];

  const chavesPeca = dimensaoAtiva(filtros.gruposPeca) ? tiposDosGrupos(filtros.gruposPeca, officeTypes) : null;
  const tiposCompromisso = dimensaoAtiva(filtros.tiposCompromisso) ? filtros.tiposCompromisso : null;

  // ---------- PEÇAS: anexos de processo/atendimento ----------
  if (querContar("PECAS")) {
    const anexos = await prisma.attachment.findMany({
      where: {
        officeId,
        createdAt: { gte: inicio, lt: fim },
        ...(chavesPeca ? { docType: { in: chavesPeca } } : {}),
      },
      select: {
        id: true,
        name: true,
        docType: true,
        driveUrl: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
        case: {
          select: { id: true, type: true, responsible: { select: { id: true, name: true } }, assessoria: { select: { id: true, client: { select: { name: true } } } } },
        },
        attendance: {
          select: { id: true, responsible: { select: { id: true, name: true } }, assessoria: { select: { id: true, client: { select: { name: true } } } } },
        },
      },
    });

    for (const a of anexos) {
      const assessoria = a.case?.assessoria ?? a.attendance?.assessoria ?? null;
      const dono = a.case?.responsible ?? a.attendance?.responsible ?? null;
      itens.push({
        id: `att-${a.id}`,
        especie: "PECA",
        nome: a.name,
        tipoLabel: getDocumentTypeLabel(a.docType, officeTypes),
        data: a.createdAt,
        origem: a.attendance ? "ATENDIMENTO" : naturezaOf(a.case?.type),
        assessoriaId: assessoria?.id ?? null,
        assessoriaNome: assessoria?.client.name ?? null,
        executorId: a.uploadedBy?.id ?? null,
        executorNome: a.uploadedBy?.name ?? null,
        responsavelId: dono?.id ?? null,
        responsavelNome: dono?.name ?? null,
        driveUrl: a.driveUrl,
        href: a.case ? `/processos/${a.case.id}` : a.attendance ? `/atendimento/${a.attendance.id}` : undefined,
      });
    }

    // ---------- PEÇAS: documentos da assessoria (inclui os de dentro das demandas) ----------
    const docs = await prisma.assessoriaDocumento.findMany({
      where: {
        officeId,
        date: { gte: inicio, lt: fim },
        ...(chavesPeca ? { docType: { in: chavesPeca } } : {}),
      },
      select: {
        id: true,
        name: true,
        docType: true,
        driveUrl: true,
        date: true,
        uploadedBy: { select: { id: true, name: true } },
        assessoria: { select: { id: true, client: { select: { name: true } }, responsible: { select: { id: true, name: true } } } },
        case: { select: { id: true, type: true, responsible: { select: { id: true, name: true } } } },
      },
    });

    for (const d of docs) {
      const dono = d.case?.responsible ?? d.assessoria?.responsible ?? null;
      itens.push({
        id: `assdoc-${d.id}`,
        especie: "PECA",
        nome: d.name,
        tipoLabel: getDocumentTypeLabel(d.docType, officeTypes),
        data: d.date,
        // Documento de assessoria sem processo vinculado é trabalho consultivo — entra como
        // "Caso (extrajudicial)", que é a origem que de fato o descreve. Com processo vinculado,
        // vale a natureza do processo, como em qualquer outro anexo.
        origem: d.case ? naturezaOf(d.case.type) : "CASO",
        assessoriaId: d.assessoria?.id ?? null,
        assessoriaNome: d.assessoria?.client.name ?? null,
        executorId: d.uploadedBy?.id ?? null,
        executorNome: d.uploadedBy?.name ?? null,
        responsavelId: dono?.id ?? null,
        responsavelNome: dono?.name ?? null,
        driveUrl: d.driveUrl,
        href: d.assessoria ? `/assessoria/${d.assessoria.id}` : undefined,
      });
    }
  }

  // ---------- COMPROMISSOS DA AGENDA ----------
  if (querContar("COMPROMISSOS")) {
    // A data que define "estar no período" muda conforme a base escolhida — e com ela muda o
    // próprio sentido do número: por produção só entra o que foi CONCLUÍDO (e a data é a da
    // conclusão); por vencimento entra o que vencia, tendo sido feito ou não.
    const filtroData =
      filtros.baseData === "PRODUCAO"
        ? { status: "CONCLUIDO", completedAt: { gte: inicio, lt: fim } }
        : filtros.baseData === "VENCIMENTO"
        ? { dueDate: { gte: inicio, lt: fim } }
        : { createdAt: { gte: inicio, lt: fim } };

    const tarefas = await prisma.task.findMany({
      where: { officeId, ...filtroData, ...(tiposCompromisso ? { type: { in: tiposCompromisso } } : {}) },
      select: {
        id: true,
        title: true,
        type: true,
        dueDate: true,
        completedAt: true,
        createdAt: true,
        responsible: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true } },
        case: {
          select: { id: true, type: true, responsible: { select: { id: true, name: true } }, assessoria: { select: { id: true, client: { select: { name: true } } } } },
        },
        attendance: {
          select: { id: true, responsible: { select: { id: true, name: true } }, assessoria: { select: { id: true, client: { select: { name: true } } } } },
        },
      },
    });

    for (const t of tarefas) {
      const assessoria = t.case?.assessoria ?? t.attendance?.assessoria ?? null;
      const dono = t.responsible ?? t.case?.responsible ?? t.attendance?.responsible ?? null;
      const data = filtros.baseData === "PRODUCAO" ? t.completedAt ?? t.dueDate : filtros.baseData === "VENCIMENTO" ? t.dueDate : t.createdAt;
      itens.push({
        id: `task-${t.id}`,
        especie: "COMPROMISSO",
        nome: t.title,
        tipoLabel: TIPO_COMPROMISSO_LABEL[t.type] ?? t.type,
        data,
        // Compromisso solto (sem processo e sem atendimento) fica com a origem do que ele mais
        // se parece — "Caso". Ele nunca chega a uma assessoria, e isso é contabilizado em
        // `semVinculoAssessoria` e mostrado na tela (decisão nº 4, validada).
        origem: t.attendance ? "ATENDIMENTO" : t.case ? naturezaOf(t.case.type) : "CASO",
        assessoriaId: assessoria?.id ?? null,
        assessoriaNome: assessoria?.client.name ?? null,
        executorId: t.completedBy?.id ?? null,
        executorNome: t.completedBy?.name ?? null,
        responsavelId: dono?.id ?? null,
        responsavelNome: dono?.name ?? null,
        href: t.case ? `/processos/${t.case.id}` : t.attendance ? `/atendimento/${t.attendance.id}` : "/agenda",
        audiencia: t.type === "AUDIENCIA",
      });
    }
  }

  // ---------- PROCESSOS E CASOS ----------
  // "Movimentado" = teve ao menos um anexo ou um compromisso no período; é a pergunta útil
  // ("em quantos processos se trabalhou"), diferente de "processos ativos", que só diz que o
  // processo existe. A checagem é feita no banco (`some`), e NÃO derivada dos itens coletados
  // acima — senão marcar só "Processos e casos" na tela, sem marcar peças nem compromissos,
  // devolveria zero, porque não haveria item nenhum de onde derivar o movimento.
  if (querContar("PROCESSOS")) {
    const janela = { gte: inicio, lt: fim };
    const movimento =
      filtros.baseData === "PRODUCAO"
        ? { status: "CONCLUIDO" as const, completedAt: janela }
        : filtros.baseData === "VENCIMENTO"
        ? { dueDate: janela }
        : { createdAt: janela };

    const processos = await prisma.case.findMany({
      where:
        filtros.baseData === "CADASTRO"
          ? { officeId, createdAt: janela }
          : {
              officeId,
              OR: [{ attachments: { some: { createdAt: janela } } }, { tasks: { some: movimento } }],
            },
      select: {
        id: true,
        title: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        responsible: { select: { id: true, name: true } },
        assessoria: { select: { id: true, client: { select: { name: true } } } },
      },
    });

    for (const c of processos) {
      itens.push({
        id: `case-${c.id}`,
        especie: "PROCESSO",
        nome: c.title,
        tipoLabel: NATUREZA_LABELS[naturezaOf(c.type)],
        data: filtros.baseData === "CADASTRO" ? c.createdAt : c.updatedAt,
        origem: naturezaOf(c.type),
        assessoriaId: c.assessoria?.id ?? null,
        assessoriaNome: c.assessoria?.client.name ?? null,
        executorId: c.responsible?.id ?? null,
        executorNome: c.responsible?.name ?? null,
        responsavelId: c.responsible?.id ?? null,
        responsavelNome: c.responsible?.name ?? null,
        href: `/processos/${c.id}`,
      });
    }
  }

  // ---------- ATENDIMENTOS ----------
  if (querContar("ATENDIMENTOS")) {
    const atendimentos = await prisma.attendance.findMany({
      where: { officeId, createdAt: { gte: inicio, lt: fim } },
      select: {
        id: true,
        clientName: true,
        subject: true,
        status: true,
        createdAt: true,
        responsible: { select: { id: true, name: true } },
        assessoria: { select: { id: true, client: { select: { name: true } } } },
      },
    });
    for (const at of atendimentos) {
      itens.push({
        id: `atd-${at.id}`,
        especie: "ATENDIMENTO",
        nome: `${at.clientName} — ${at.subject}`,
        tipoLabel: "Atendimento",
        data: at.createdAt,
        origem: "ATENDIMENTO",
        assessoriaId: at.assessoria?.id ?? null,
        assessoriaNome: at.assessoria?.client.name ?? null,
        executorId: at.responsible?.id ?? null,
        executorNome: at.responsible?.name ?? null,
        responsavelId: at.responsible?.id ?? null,
        responsavelNome: at.responsible?.name ?? null,
        href: `/atendimento/${at.id}`,
      });
    }
  }

  // ---------- DEMANDAS (pastas de parecer da assessoria) ----------
  if (querContar("DEMANDAS")) {
    const demandas = await prisma.parecer.findMany({
      where: { officeId, ...(filtros.baseData === "CADASTRO" ? { createdAt: { gte: inicio, lt: fim } } : { date: { gte: inicio, lt: fim } }) },
      select: {
        id: true,
        name: true,
        date: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
        assessoria: { select: { id: true, client: { select: { name: true } }, responsible: { select: { id: true, name: true } } } },
      },
    });
    for (const d of demandas) {
      itens.push({
        id: `parecer-${d.id}`,
        especie: "DEMANDA",
        nome: d.name,
        tipoLabel: "Demanda",
        data: filtros.baseData === "CADASTRO" ? d.createdAt : d.date,
        origem: "CASO",
        assessoriaId: d.assessoria?.id ?? null,
        assessoriaNome: d.assessoria?.client.name ?? null,
        executorId: d.createdBy?.id ?? null,
        executorNome: d.createdBy?.name ?? null,
        responsavelId: d.assessoria?.responsible?.id ?? null,
        responsavelNome: d.assessoria?.responsible?.name ?? null,
        href: d.assessoria ? `/assessoria/${d.assessoria.id}` : undefined,
      });
    }
  }

  // ---------- PUBLICAÇÕES E ANDAMENTOS ----------
  // Só entram quando a origem correspondente está marcada — publicação não é "trabalho
  // produzido" pelo escritório, é entrada de fora; contá-la junto por padrão inflaria o número
  // que o relatório existe para medir.
  if (filtros.origens.includes("PUBLICACAO")) {
    const publicacoes = await prisma.publication.findMany({
      where: { officeId, publishedAt: { gte: inicio, lt: fim } },
      select: {
        id: true,
        kind: true,
        content: true,
        publishedAt: true,
        assignedTo: { select: { id: true, name: true } },
        case: {
          select: { id: true, type: true, responsible: { select: { id: true, name: true } }, assessoria: { select: { id: true, client: { select: { name: true } } } } },
        },
      },
    });
    for (const p of publicacoes) {
      itens.push({
        id: `pub-${p.id}`,
        especie: "PUBLICACAO",
        nome: p.content.slice(0, 120),
        tipoLabel: p.kind === "ANDAMENTO" ? "Andamento" : "Publicação",
        data: p.publishedAt,
        origem: "PUBLICACAO",
        assessoriaId: p.case?.assessoria?.id ?? null,
        assessoriaNome: p.case?.assessoria?.client.name ?? null,
        executorId: p.assignedTo?.id ?? null,
        executorNome: p.assignedTo?.name ?? null,
        responsavelId: p.case?.responsible?.id ?? null,
        responsavelNome: p.case?.responsible?.name ?? null,
        href: `/publicacoes`,
      });
    }
  }

  return itens;
}

function aplicarFiltros(itens: ItemNormalizado[], filtros: RelatorioFiltros): ItemNormalizado[] {
  return itens.filter((i) => {
    if (!passaOrigem(filtros.origens, i.origem)) return false;
    if (!passaDimensao(filtros.assessoriaIds, i.assessoriaId, SEM_ASSESSORIA)) return false;
    const credito = creditoDe(i, filtros.criterioAutoria);
    if (!passaDimensao(filtros.responsavelIds, credito.id, SEM_RESPONSAVEL)) return false;
    return true;
  });
}

export async function gerarRelatorio(filtros: RelatorioFiltros): Promise<{ error?: string; resultado?: RelatorioResultado }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!filtros.de || !filtros.ate) return { error: "Informe a data inicial e a data final." };
  if (filtros.de > filtros.ate) return { error: "A data inicial não pode ser posterior à data final." };

  const { inicio, fim, anteriorInicio, anteriorFim } = limites(filtros);
  const officeTypes = await carregarOfficeTypes(user.officeId);

  const [brutoAtual, brutoAnterior] = await Promise.all([
    coletar(user.officeId, filtros, inicio, fim, officeTypes),
    coletar(user.officeId, filtros, anteriorInicio, anteriorFim, officeTypes),
  ]);

  // Seleção manual da janela de conferência (ver itensExcluidos em lib/relatorioPersonalizado.ts)
  // — só tira item do período ATUAL, nunca do anterior: o período anterior é só a base de
  // comparação (▲/▼), curadoria manual de HOJE não faz sentido aplicada a um período que já
  // passou e que a pessoa nem está revisando.
  const excluidos = new Set(filtros.itensExcluidos ?? []);
  const atualBruto = aplicarFiltros(brutoAtual, filtros);
  const atual = excluidos.size > 0 ? atualBruto.filter((i) => !excluidos.has(i.id)) : atualBruto;
  const anterior = aplicarFiltros(brutoAnterior, filtros);

  const conta = (lista: ItemNormalizado[], especie: ItemNormalizado["especie"]) => lista.filter((i) => i.especie === especie).length;

  const querContar = (c: Contagem) => filtros.contar.length === 0 || filtros.contar.includes(c);

  const blocos: RelatorioResultado["blocos"] = [];
  if (querContar("PECAS")) {
    blocos.push({ chave: "PECAS", rotulo: "Peças produzidas", valor: conta(atual, "PECA"), anterior: conta(anterior, "PECA") });
  }
  if (querContar("COMPROMISSOS")) {
    blocos.push({
      chave: "COMPROMISSOS",
      rotulo: filtros.baseData === "PRODUCAO" ? "Compromissos realizados" : "Compromissos no período",
      valor: conta(atual, "COMPROMISSO"),
      anterior: conta(anterior, "COMPROMISSO"),
    });
    const aud = atual.filter((i) => i.audiencia).length;
    const audAnt = anterior.filter((i) => i.audiencia).length;
    if (aud > 0 || audAnt > 0) {
      blocos.push({ chave: "AUDIENCIAS", rotulo: "Audiências", valor: aud, anterior: audAnt });
    }
  }
  if (querContar("PROCESSOS")) {
    blocos.push({
      chave: "PROCESSOS",
      rotulo: filtros.baseData === "CADASTRO" ? "Processos cadastrados" : "Processos movimentados",
      valor: conta(atual, "PROCESSO"),
      anterior: conta(anterior, "PROCESSO"),
      detalhe: filtros.baseData === "CADASTRO" ? undefined : "com ao menos um anexo ou compromisso no período",
    });
  }
  if (querContar("ATENDIMENTOS")) {
    blocos.push({ chave: "ATENDIMENTOS", rotulo: "Atendimentos", valor: conta(atual, "ATENDIMENTO"), anterior: conta(anterior, "ATENDIMENTO") });
  }
  if (querContar("DEMANDAS")) {
    blocos.push({ chave: "DEMANDAS", rotulo: "Demandas", valor: conta(atual, "DEMANDA"), anterior: conta(anterior, "DEMANDA") });
  }
  if (filtros.origens.includes("PUBLICACAO")) {
    blocos.push({ chave: "PUBLICACOES", rotulo: "Publicações e andamentos", valor: conta(atual, "PUBLICACAO"), anterior: conta(anterior, "PUBLICACAO") });
  }

  // --- por pessoa ---
  const mapaPessoa = new Map<string, LinhaAgregada>();
  for (const i of atual) {
    const credito = creditoDe(i, filtros.criterioAutoria);
    const chave = credito.id ?? SEM_RESPONSAVEL;
    let linha = mapaPessoa.get(chave);
    if (!linha) {
      linha = { chave, rotulo: credito.nome ?? "Sem responsável", pecas: 0, compromissos: 0, total: 0 };
      mapaPessoa.set(chave, linha);
    }
    if (i.especie === "PECA") linha.pecas += 1;
    if (i.especie === "COMPROMISSO") linha.compromissos += 1;
    linha.total += 1;
  }

  // --- por assessoria ---
  const mapaAssessoria = new Map<string, LinhaAgregada>();
  let semVinculo = 0;
  for (const i of atual) {
    if (!i.assessoriaId) {
      semVinculo += 1;
      continue;
    }
    let linha = mapaAssessoria.get(i.assessoriaId);
    if (!linha) {
      linha = { chave: i.assessoriaId, rotulo: i.assessoriaNome ?? "—", pecas: 0, compromissos: 0, total: 0 };
      mapaAssessoria.set(i.assessoriaId, linha);
    }
    if (i.especie === "PECA") linha.pecas += 1;
    if (i.especie === "COMPROMISSO") linha.compromissos += 1;
    linha.total += 1;
  }

  const ordenados = [...atual].sort((a, b) => b.data.getTime() - a.data.getTime());
  const detalhes: LinhaDetalhe[] = ordenados.slice(0, TETO_DETALHE).map((i) => ({
    id: i.id,
    especie: i.especie,
    audiencia: i.audiencia,
    nome: i.nome,
    tipoLabel: i.tipoLabel,
    driveUrl: i.driveUrl,
    href: i.href,
    origemLabel: i.origem === "ATENDIMENTO" ? "Atendimento" : i.origem === "PUBLICACAO" ? "Publicação" : NATUREZA_LABELS[i.origem],
    assessoriaNome: i.assessoriaNome ?? undefined,
    anexadoPor: i.executorNome ?? undefined,
    responsavel: i.responsavelNome ?? undefined,
    data: i.data.toISOString(),
  }));

  return {
    resultado: {
      periodo: {
        de: filtros.de,
        ate: filtros.ate,
        anteriorDe: anteriorInicio.toISOString().slice(0, 10),
        anteriorAte: new Date(anteriorFim.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      },
      blocos,
      porPessoa: Array.from(mapaPessoa.values()).sort((a, b) => b.total - a.total),
      porAssessoria: Array.from(mapaAssessoria.values()).sort((a, b) => b.total - a.total),
      detalhes,
      detalhesTotal: atual.length,
      semVinculoAssessoria: semVinculo,
    },
  };
}

// ---------------------------------------------------------------------------
// Modelos salvos
// ---------------------------------------------------------------------------

// Confere se cada valor escolhido nos filtros ainda existe. Roda antes de gravar um modelo (e de
// novo ao carregá-lo), porque um modelo guarda IDs: a assessoria pode ter sido encerrada e o
// usuário desativado depois. Sem esta checagem, o modelo continuaria filtrando por um ID fantasma
// e devolveria relatório vazio sem dizer por quê.
async function conferirExistencia(officeId: string, filtros: RelatorioFiltros): Promise<FiltroInexistente[]> {
  const faltando: FiltroInexistente[] = [];

  const assessoriaIds = filtros.assessoriaIds.filter((id) => id !== SEM_ASSESSORIA);
  if (assessoriaIds.length > 0) {
    const achadas = await prisma.assessoria.findMany({
      where: { officeId, id: { in: assessoriaIds } },
      select: { id: true, client: { select: { name: true } } },
    });
    const mapa = new Map(achadas.map((a) => [a.id, a.client.name]));
    for (const id of assessoriaIds) {
      if (!mapa.has(id)) faltando.push({ dimensao: "Assessoria", valor: id });
    }
  }

  const responsavelIds = filtros.responsavelIds.filter((id) => id !== SEM_RESPONSAVEL);
  if (responsavelIds.length > 0) {
    const achados = await prisma.user.findMany({
      where: { officeId, id: { in: responsavelIds }, active: true },
      select: { id: true, name: true },
    });
    const mapa = new Map(achados.map((u) => [u.id, u.name]));
    for (const id of responsavelIds) {
      if (!mapa.has(id)) {
        // Pode existir mas estar inativo — a mensagem precisa dizer QUAL é o caso, senão o
        // usuário fica procurando um nome que ele sabe que existe.
        const inativo = await prisma.user.findFirst({ where: { officeId, id }, select: { name: true } });
        faltando.push({ dimensao: "Responsável", valor: inativo ? `${inativo.name} (inativo)` : id });
      }
    }
  }

  if (filtros.gruposPeca.length > 0) {
    const officeTypes = await carregarOfficeTypes(officeId);
    const existentes = new Set(composeDocumentTypeGroups(officeTypes).map((g) => g.group));
    for (const g of filtros.gruposPeca) {
      if (!existentes.has(g)) faltando.push({ dimensao: "Tipo de peça", valor: g });
    }
  }

  return faltando;
}

export async function salvarModelo(
  nome: string,
  filtros: RelatorioFiltros
): Promise<{ error?: string; inexistentes?: FiltroInexistente[]; id?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (!nome.trim()) return { error: "Dê um nome ao modelo." };

  const inexistentes = await conferirExistencia(user.officeId, filtros);
  if (inexistentes.length > 0) {
    return { inexistentes };
  }

  try {
    const criado = await prisma.relatorioModelo.upsert({
      where: { officeId_nome: { officeId: user.officeId, nome: nome.trim() } },
      create: {
        officeId: user.officeId,
        nome: nome.trim(),
        filtros: filtros as unknown as object,
        createdById: user.id,
      },
      update: { filtros: filtros as unknown as object },
      select: { id: true },
    });
    revalidatePath("/relatorios");
    return { id: criado.id };
  } catch {
    return { error: "Não foi possível salvar o modelo. Tente outro nome." };
  }
}

export async function listarModelos(): Promise<ModeloSalvo[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const modelos = await prisma.relatorioModelo.findMany({
    where: { officeId: user.officeId },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, filtros: true, createdAt: true },
  });
  return modelos.map((m) => ({
    id: m.id,
    nome: m.nome,
    filtros: m.filtros as unknown as RelatorioFiltros,
    criadoEm: m.createdAt.toISOString(),
  }));
}

// Carregar também confere: um modelo salvo há meses pode apontar para assessoria encerrada ou
// pessoa desativada. Devolve os filtros do jeito que foram salvos MAIS a lista do que sumiu, para
// a tela avisar em vez de silenciosamente devolver um relatório vazio.
export async function carregarModelo(id: string): Promise<{ error?: string; filtros?: RelatorioFiltros; inexistentes?: FiltroInexistente[] }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const modelo = await prisma.relatorioModelo.findFirst({
    where: { id, officeId: user.officeId },
    select: { filtros: true },
  });
  if (!modelo) return { error: "Modelo não encontrado." };
  const filtros = modelo.filtros as unknown as RelatorioFiltros;
  const inexistentes = await conferirExistencia(user.officeId, filtros);
  return { filtros, inexistentes };
}

export async function excluirModelo(id: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  const modelo = await prisma.relatorioModelo.findFirst({ where: { id, officeId: user.officeId }, select: { id: true } });
  if (!modelo) return { error: "Modelo não encontrado." };
  await prisma.relatorioModelo.delete({ where: { id } });
  revalidatePath("/relatorios");
  return {};
}
