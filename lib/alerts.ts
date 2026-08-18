import { prisma } from "@/lib/prisma";
import { valorLiquido, saldoEmAberto } from "@/lib/financeCalc";
import { pendenciaKindLabel } from "@/lib/pendencias";

export type AlertItem = {
  id: string;
  kind:
    | "PRAZO_VENCIDO"
    | "CONTA_PAGAR_VENCIDA"
    | "CONTA_RECEBER_VENCIDA"
    | "MENCAO"
    | "PARCELA_SEM_VENCIMENTO"
    | "FOLLOWUP_ATRASADO"
    | "TAREFA_DELEGADA"
    | "DRIVE_INCONSISTENCIA"
    // Porta 1 (Fase 4 — apuração do êxito): processo com parcela A_APURAR que recebeu publicação/
    // andamento cujo conteúdo casa com termo de decisão (ver contemPalavraDecisao abaixo).
    | "HONORARIO_APURAR_DECISAO"
    // Alerta de acompanhamento (Fase 4): parcela A_APURAR parada há mais de 90 dias, mesmo sem
    // nenhuma publicação nova — para o sócio não esquecer de cobrar/consultar o andamento.
    | "HONORARIO_APURAR_PARADO"
    // Fase 5 (Atendimento) — pendência do atendimento (SOLICITAR/ENVIAR, ver
    // model AtendimentoPendencia) com prazo vencido e ainda não concluída.
    | "PENDENCIA_ATENDIMENTO_VENCIDA"
    // Fase 5 — prazo de resposta ao lead (Attendance.responseDeadline) estourou sem nenhuma
    // primeira resposta registrada (Attendance.firstResponseAt) — "lead sem retorno é lead perdido".
    | "RESPOSTA_PRAZO_ESTOURADO";
  title: string;
  subtitle?: string;
  date: Date;
  href: string;
  severity: "alta" | "media" | "baixa";
  // Entidade real por trás do alerta — usada para rotear o clique (abrir o card de baixa,
  // o card do compromisso, ou navegar direto), já que `kind` mistura pagar/receber em PARCELA_SEM_VENCIMENTO.
  entityKind?: "PAYABLE" | "RECEIVABLE" | "TASK" | "COMMENT" | "ATTENDANCE";
  entityId?: string;
  amount?: number;
  // Número do processo do Case vinculado (quando o alerta vem de uma tarefa presa a um
  // processo) — exibido como chip copiável na Central de Alertas.
  processNumber?: string;
  // Urgência por data (compromissos/atividades/audiências/prazos/perícias/tarefas delegadas/
  // pendências distribuídas apenas — contas e menções não usam isso): "atrasado" pinta o card
  // de bordô, "hoje" de ouro, ambos com transparência; sem data especial (vincendo) não muda.
  dueStatus?: "atrasado" | "hoje";
};

export type TodayItem = {
  id: string;
  kind: "TAREFA" | "EVENTO" | "AUDIENCIA" | "PERICIA" | "PRAZO" | "CONTA_PAGAR" | "CONTA_RECEBER";
  title: string;
  subtitle?: string;
  time?: string | null;
  href: string;
  dueStatus?: "atrasado" | "hoje";
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// "atrasado" (antes de hoje) pinta bordô, "hoje" pinta ouro, qualquer outra data (vincendo,
// futuro) não muda nada — ver AlertItem.dueStatus/TodayItem.dueStatus.
function computeDueStatus(dueDate: Date, now: Date): "atrasado" | "hoje" | undefined {
  if (dueDate < startOfDay(now)) return "atrasado";
  if (dueDate <= endOfDay(now)) return "hoje";
  return undefined;
}

// Sem acento/case, só para comparar substring — o projeto não tinha um helper de normalização de
// texto compartilhado (o mais parecido, normalizeForCompare em lib/driveSync.ts, compara nome de
// pasta, não vale a pena importar de lá para um assunto totalmente diferente). Usado só pela Porta
// 1 da apuração do êxito (contemPalavraDecisao), abaixo.
function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Termos que indicam decisão/desfecho num andamento ou publicação — casa com "sentença",
// "acórdão", "julgo procedente", "condeno", "trânsito em julgado" ou "homologo" (acordo
// homologado), sem acento e case-insensitive. Não tenta ser exaustivo (não substitui a leitura de
// quem recebe o alerta) — é só o gatilho que traz o processo para a Central de Alertas assim que
// há parcela percentual a apurar E algo que parece decisão.
const DECISAO_KEYWORDS = ["sentenca", "acordao", "julgo procedente", "condeno", "transito em julgado", "homologo"];

function contemPalavraDecisao(content: string): boolean {
  const normalizado = normalizarTexto(content);
  return DECISAO_KEYWORDS.some((k) => normalizado.includes(k));
}

// Janela de "publicação recente" para a Porta 1 — decisão publicada há mais tempo que isso já não
// conta como "acabou de sair"; o processo continua coberto pelo alerta de acompanhamento
// (HONORARIO_APURAR_PARADO, 90 dias parado) de qualquer forma. Escolha própria, documentada no
// relatório da Fase 4: nenhum requisito do produto fixou um número.
const DECISAO_JANELA_DIAS = 30;

// Quantos dias parada uma parcela A_APURAR precisa estar para virar alerta de acompanhamento —
// mesma lógica (escolha própria, sem requisito explícito do produto).
const APURAR_PARADO_DIAS = 90;

// Prazos vencidos, contas a pagar/receber vencidas, parcelas sem vencimento e menções —
// ficam visíveis até serem tratados (diferente de publicações, que somem da própria aba ao serem lidas).
// Toda consulta de Payable/Receivable abaixo filtra status por LISTA EXPLÍCITA (["PENDENTE",
// "ATRASADO", "PARCIAL"] nas duas vencidas — ver correção da Fase 3 logo abaixo — ou só
// ["PENDENTE", "ATRASADO"] nas sem-vencimento, que PARCIAL não se aplica), nunca por negação —
// por isso A_APURAR (Fase 1: provisão de honorário percentual sem valor real ainda) já fica fora
// destes alertas sem precisar de exclusão adicional.
// Correção da Fase 3: uma conta PARCIAL vencida (já teve algum FinancePayment lançado, mas o
// saldo em aberto continua > 0) antes só entrava aqui como ["PENDENTE","ATRASADO"] — nunca
// aparecia no alerta de conta vencida, mesmo tendo dinheiro de verdade em aberto. Passou a entrar
// nas DUAS consultas "vencida" abaixo (contagem e listagem), com o subtitle mostrando o SALDO EM
// ABERTO (não mais o valor cheio) — ver saldoEmAberto, lib/financeCalc.ts.
// `viewerId`: quando informado, também busca tarefas delegadas para esse usuário ainda não
// vistas (delegationAcknowledgedAt null) — alerta pessoal, visível só pra quem recebeu.
// `includeDriveSync`: segue o MESMO padrão de includeFinance, mas gated por isAdmin (não por
// financeAccess) — inconsistência de estrutura no Drive é assunto de sócio/administrador, ver
// lib/driveSync.ts. Default false para não vazar pra quem chama getAlerts sem saber que este
// gate existe (ex: lib/email.ts, que filtra por kind e nunca precisaria disso mesmo assim).
export async function getAlerts(
  officeId: string,
  includeFinance: boolean = true,
  viewerId?: string,
  includeDriveSync: boolean = false
): Promise<AlertItem[]> {
  const now = new Date();
  // dueDate é data-calendário (meia-noite) — comparar contra `now` (timestamp com hora) marca
  // como "vencido" tudo que vence HOJE a partir de 00:00:01. startOfDay já existe acima e é o
  // que computeDueStatus usa para acertar essa mesma conta; as consultas abaixo usavam `now`
  // cru e ficavam em desacordo com o próprio rótulo que este arquivo calcula.
  const hoje = startOfDay(now);

  // MENCAO/FOLLOWUP_ATRASADO/PARCELA_SEM_VENCIMENTO/DRIVE_INCONSISTENCIA não têm nenhuma ação
  // de resolver — dispensados via botão "Lido" (dismissAlert em lib/actions/alerts.ts),
  // por usuário. Buscado antes do Promise.all abaixo pra poder excluir cada tipo já na query.
  const dismissedByKind = new Map<string, Set<string>>();
  if (viewerId) {
    const dismissals = await prisma.alertDismissal.findMany({ where: { userId: viewerId }, select: { kind: true, entityId: true } });
    for (const d of dismissals) {
      if (!dismissedByKind.has(d.kind)) dismissedByKind.set(d.kind, new Set());
      dismissedByKind.get(d.kind)!.add(d.entityId);
    }
  }
  const dismissedFollowupIds = Array.from(dismissedByKind.get("FOLLOWUP_ATRASADO") ?? []);
  const dismissedParcelaIds = Array.from(dismissedByKind.get("PARCELA_SEM_VENCIMENTO") ?? []);
  const dismissedDriveIds = Array.from(dismissedByKind.get("DRIVE_INCONSISTENCIA") ?? []);
  const dismissedApurarDecisaoIds = dismissedByKind.get("HONORARIO_APURAR_DECISAO") ?? new Set<string>();
  const dismissedApurarParadoIds = dismissedByKind.get("HONORARIO_APURAR_PARADO") ?? new Set<string>();

  const [
    overdueTasks,
    overduePayables,
    overdueReceivables,
    unreadMentions,
    undatedPayables,
    undatedReceivables,
    overdueFollowups,
    delegatedTasks,
    driveSyncIssues,
    apurarReceivables,
    overduePendencias,
    overdueResponseDeadlines,
  ] = await Promise.all([
      prisma.task.findMany({
        where: { officeId, dueDate: { lt: hoje }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
        include: { case: true },
        orderBy: { dueDate: "asc" },
      }),
      includeFinance
        ? prisma.payable.findMany({
            where: { officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, dueDate: { lt: hoje }, noDueDate: false },
            include: { payments: true },
          })
        : Promise.resolve([]),
      includeFinance
        ? prisma.receivable.findMany({
            where: { officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, dueDate: { lt: hoje }, noDueDate: false },
            include: { payments: true },
          })
        : Promise.resolve([]),
      viewerId
        ? prisma.mention.findMany({
            where: { officeId, userId: viewerId, read: false, ...(dismissedByKind.has("MENCAO") ? { commentId: { notIn: Array.from(dismissedByKind.get("MENCAO")!) } } : {}) },
            include: { comment: { include: { author: true, case: true, task: true } } },
          })
        : Promise.resolve([]),
      includeFinance
        ? prisma.payable.findMany({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
        : Promise.resolve([]),
      includeFinance
        ? prisma.receivable.findMany({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
        : Promise.resolve([]),
      prisma.attendance.findMany({
        where: { officeId, nextContactAt: { lt: now }, stage: { notIn: ["FECHADO", "PERDIDO"] }, status: { not: "ARQUIVADO" }, id: { notIn: dismissedFollowupIds } },
        orderBy: { nextContactAt: "asc" },
      }),
      viewerId
        ? prisma.task.findMany({
            where: { officeId, responsibleId: viewerId, delegatedById: { not: null }, delegationAcknowledgedAt: null },
            include: { case: true, delegatedBy: true },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      includeDriveSync
        ? prisma.driveSyncIssue.findMany({
            where: { officeId, resolvedAt: null, id: { notIn: dismissedDriveIds } },
            include: { case: { select: { id: true, processNumber: true } }, attendance: { select: { id: true } } },
            orderBy: { detectedAt: "desc" },
          })
        : Promise.resolve([]),
      // Base para as duas Portas de apuração do êxito (1 — decisão publicada; acompanhamento —
      // parada há mais de 90 dias): toda parcela A_APURAR do escritório, com o processo (para
      // título/link) — filtrada de novo por caseId != null porque, embora o Server Action sempre
      // vincule esta parcela a um Case, o campo é opcional no schema.
      includeFinance
        ? prisma.receivable.findMany({
            where: { officeId, status: "A_APURAR", caseId: { not: null } },
            select: { id: true, createdAt: true, caseId: true, case: { select: { id: true, title: true, processNumber: true } } },
          })
        : Promise.resolve([]),
      // Fase 5 — pendências do atendimento (SOLICITAR/ENVIAR) com prazo vencido e ainda abertas.
      prisma.atendimentoPendencia.findMany({
        where: { officeId, status: "PENDENTE", dueDate: { lt: now } },
        include: { attendance: { select: { id: true, clientName: true } } },
        orderBy: { dueDate: "asc" },
      }),
      // Fase 5 — prazo de resposta ao lead estourado sem primeira resposta registrada. Exclui
      // atendimentos já encerrados (arquivado/rascunho/convertido) — não faz sentido cobrar
      // resposta de um lead que já não está mais em aberto.
      prisma.attendance.findMany({
        where: {
          officeId,
          responseDeadline: { lt: now },
          firstResponseAt: null,
          status: { notIn: ["ARQUIVADO", "CONVERTIDO", "RASCUNHO"] },
        },
        orderBy: { responseDeadline: "asc" },
      }),
    ]);

  // Publicações recentes dos processos com parcela a apurar (Porta 1) — consulta separada porque
  // depende do resultado de apurarReceivables (lista de caseId), então não dá para entrar no
  // Promise.all acima sem duplicar a query de apurarReceivables só para extrair os ids antes.
  const apurarCaseIds = Array.from(new Set(apurarReceivables.map((r) => r.caseId).filter((id): id is string => Boolean(id))));
  const decisaoCutoff = new Date(now.getTime() - DECISAO_JANELA_DIAS * 86400000);
  const publicacoesRecentes = apurarCaseIds.length
    ? await prisma.publication.findMany({
        where: { officeId, caseId: { in: apurarCaseIds }, publishedAt: { gte: decisaoCutoff } },
        select: { caseId: true, content: true, publishedAt: true },
        orderBy: { publishedAt: "desc" },
      })
    : [];

  const alerts: AlertItem[] = [];

  for (const t of overdueTasks) {
    alerts.push({
      id: `task-overdue-${t.id}`,
      kind: "PRAZO_VENCIDO",
      title: t.title,
      subtitle: t.case?.title,
      date: t.dueDate,
      href: `/agenda`,
      severity: "alta",
      entityKind: "TASK",
      entityId: t.id,
      processNumber: t.case?.processNumber ?? undefined,
      dueStatus: "atrasado",
    });
  }
  for (const p of overduePayables) {
    // Saldo em aberto, não o valor cheio (Fase 3): uma conta PARCIAL vencida já teve parte paga —
    // o alerta deve refletir só o que ainda falta sair do caixa, senão soaria como se nada tivesse
    // sido pago ainda.
    const somaPaga = p.payments.reduce((s, x) => s + x.amount, 0);
    const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, somaPaga);
    alerts.push({
      id: `payable-${p.id}`,
      kind: "CONTA_PAGAR_VENCIDA",
      title: p.description,
      subtitle: `R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${p.status === "PARCIAL" ? " (saldo em aberto)" : ""}`,
      date: p.dueDate,
      href: `/financeiro/despesas`,
      severity: "alta",
      entityKind: "PAYABLE",
      entityId: p.id,
      amount: saldo,
    });
  }
  for (const r of overdueReceivables) {
    const somaPaga = r.payments.reduce((s, x) => s + x.amount, 0);
    const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, somaPaga);
    alerts.push({
      id: `receivable-${r.id}`,
      kind: "CONTA_RECEBER_VENCIDA",
      title: r.description,
      subtitle: `R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${r.status === "PARCIAL" ? " (saldo em aberto)" : ""}`,
      date: r.dueDate,
      href: `/financeiro/receitas`,
      severity: "media",
      entityKind: "RECEIVABLE",
      entityId: r.id,
      amount: saldo,
    });
  }
  for (const p of undatedPayables) {
    const liquido = valorLiquido(p.amount, p.discount, p.surcharge);
    alerts.push({
      id: `payable-undated-${p.id}`,
      kind: "PARCELA_SEM_VENCIMENTO",
      title: `Definir vencimento: ${p.description}`,
      subtitle: `R$ ${liquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · revisar todo início de mês`,
      date: p.dueDate,
      href: `/financeiro/despesas`,
      severity: "baixa",
      entityKind: "PAYABLE",
      entityId: p.id,
      amount: liquido,
    });
  }
  for (const r of undatedReceivables) {
    const liquido = valorLiquido(r.amount, r.discount, r.surcharge);
    alerts.push({
      id: `receivable-undated-${r.id}`,
      kind: "PARCELA_SEM_VENCIMENTO",
      title: `Definir vencimento: ${r.description}`,
      subtitle: `R$ ${liquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · revisar todo início de mês`,
      date: r.dueDate,
      href: `/financeiro/receitas`,
      severity: "baixa",
      entityKind: "RECEIVABLE",
      entityId: r.id,
      amount: liquido,
    });
  }
  for (const f of overdueFollowups) {
    if (!f.nextContactAt) continue;
    alerts.push({
      id: `followup-${f.id}`,
      kind: "FOLLOWUP_ATRASADO",
      title: `Follow-up atrasado: ${f.clientName}`,
      subtitle: f.subject,
      date: f.nextContactAt,
      href: `/atendimento/${f.id}`,
      severity: "media",
      entityKind: "ATTENDANCE",
      entityId: f.id,
    });
  }
  for (const p of overduePendencias) {
    if (!p.dueDate) continue;
    const direction = p.direction === "ENVIAR" ? "Enviar" : "Solicitar";
    alerts.push({
      id: `pendencia-atendimento-${p.id}`,
      kind: "PENDENCIA_ATENDIMENTO_VENCIDA",
      title: `${direction} · ${pendenciaKindLabel(p.direction, p.kind)} — ${p.attendance.clientName}`,
      subtitle: p.description || undefined,
      date: p.dueDate,
      href: `/atendimento/${p.attendanceId}`,
      severity: "media",
      entityKind: "ATTENDANCE",
      entityId: p.attendanceId,
      dueStatus: "atrasado",
    });
  }
  for (const a of overdueResponseDeadlines) {
    if (!a.responseDeadline) continue;
    alerts.push({
      id: `resposta-prazo-${a.id}`,
      kind: "RESPOSTA_PRAZO_ESTOURADO",
      title: `Sem resposta ao lead: ${a.clientName}`,
      subtitle: a.subject,
      date: a.responseDeadline,
      href: `/atendimento/${a.id}`,
      severity: "alta",
      entityKind: "ATTENDANCE",
      entityId: a.id,
      dueStatus: "atrasado",
    });
  }
  for (const t of delegatedTasks) {
    alerts.push({
      id: `task-delegated-${t.id}`,
      kind: "TAREFA_DELEGADA",
      title: `${t.delegatedBy?.name} atribuiu: ${t.title}`,
      subtitle: t.case?.title,
      date: t.createdAt,
      href: `/agenda`,
      severity: "media",
      entityKind: "TASK",
      entityId: t.id,
      processNumber: t.case?.processNumber ?? undefined,
      dueStatus: computeDueStatus(t.dueDate, now),
    });
  }
  for (const issue of driveSyncIssues) {
    alerts.push({
      id: `drive-sync-${issue.id}`,
      kind: "DRIVE_INCONSISTENCIA",
      title: issue.description,
      subtitle: issue.suggestedFix,
      date: issue.detectedAt,
      href: issue.case ? `/processos/${issue.case.id}` : issue.attendance ? `/atendimento/${issue.attendance.id}` : "/alertas",
      severity: "alta",
      processNumber: issue.case?.processNumber ?? undefined,
      entityId: issue.id,
    });
  }
  for (const m of unreadMentions) {
    alerts.push({
      id: `mention-${m.id}`,
      kind: "MENCAO",
      title: `${m.comment.author.name} mencionou você`,
      subtitle: m.comment.content.slice(0, 60),
      date: m.createdAt,
      href: m.comment.caseId ? `/processos/${m.comment.caseId}?tab=comentarios` : "/kanban",
      severity: "baixa",
      entityKind: "COMMENT",
      entityId: m.comment.id,
    });
  }

  // Porta 1 (automática, por publicação) — um alerta por PROCESSO (não por parcela): junta as
  // publicações recentes de cada caso com parcela A_APURAR e sinaliza o primeiro casamento com
  // termo de decisão encontrado. entityId aqui é o caseId (não uma Receivable/Payable) — de
  // propósito, sem entityKind: assim AlertRow (components/AlertRow.tsx) cai no <Link> padrão
  // (href = aba Financeiro do processo) em vez de tentar abrir o card de baixa de uma parcela que
  // ainda nem tem valor real.
  const publicacoesPorCaso = new Map<string, { content: string; publishedAt: Date }[]>();
  for (const p of publicacoesRecentes) {
    if (!p.caseId) continue;
    if (!publicacoesPorCaso.has(p.caseId)) publicacoesPorCaso.set(p.caseId, []);
    publicacoesPorCaso.get(p.caseId)!.push(p);
  }
  for (const [caseId, pubs] of publicacoesPorCaso) {
    if (dismissedApurarDecisaoIds.has(caseId)) continue;
    const decisao = pubs.find((p) => contemPalavraDecisao(p.content));
    if (!decisao) continue;
    const kase = apurarReceivables.find((r) => r.caseId === caseId)?.case;
    alerts.push({
      id: `honorario-apurar-decisao-${caseId}`,
      kind: "HONORARIO_APURAR_DECISAO",
      title: `Honorário percentual a apurar — houve decisão em ${kase?.title ?? "processo"}`,
      subtitle: decisao.content.slice(0, 100),
      date: decisao.publishedAt,
      href: `/processos/${caseId}?tab=financeiro`,
      severity: "media",
      entityId: caseId,
      processNumber: kase?.processNumber ?? undefined,
    });
  }

  // Acompanhamento — parcela A_APURAR parada há mais de 90 dias, mesmo sem publicação nova (o
  // processo pode nunca gerar uma publicação identificável, ou o robô pode ter perdido uma) —
  // rede de segurança para o sócio não esquecer de consultar/cobrar o andamento. Um processo que
  // já disparou a Porta 1 acima também pode cair aqui (as duas não são mutuamente exclusivas: uma
  // é "aconteceu algo", a outra é "faz tempo que nada aconteceu"), o sócio só vê os dois cards.
  for (const r of apurarReceivables) {
    if (!r.caseId || !r.case) continue;
    if (dismissedApurarParadoIds.has(r.id)) continue;
    const diasParada = Math.floor((now.getTime() - r.createdAt.getTime()) / 86400000);
    if (diasParada < APURAR_PARADO_DIAS) continue;
    alerts.push({
      id: `honorario-apurar-parado-${r.id}`,
      kind: "HONORARIO_APURAR_PARADO",
      title: `Honorário a apurar parado há ${diasParada} dias — ${r.case.title}`,
      subtitle: "Sem desfecho registrado ainda — considere consultar o andamento do processo.",
      date: r.createdAt,
      href: `/processos/${r.caseId}?tab=financeiro`,
      severity: "baixa",
      entityId: r.id,
      processNumber: r.case.processNumber ?? undefined,
    });
  }

  return alerts.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Mesmo conjunto de critérios de getAlerts() acima, mas só CONTANDO (sem os includes de
// case/comment/author, que ela busca pra exibir na Central de Alertas) — usado onde só o
// número importa (badge do ícone do PWA, badge do item "Alertas" no menu), pra não pagar o
// custo dos joins/conteúdo completo só pra chegar num inteiro.
export async function getAlertsCount(
  officeId: string,
  includeFinance: boolean = true,
  viewerId?: string,
  includeDriveSync: boolean = false
): Promise<number> {
  const now = new Date();
  // Mesma correção de getAlerts acima — ver comentário lá.
  const hoje = startOfDay(now);

  const dismissedByKind = new Map<string, Set<string>>();
  if (viewerId) {
    const dismissals = await prisma.alertDismissal.findMany({ where: { userId: viewerId }, select: { kind: true, entityId: true } });
    for (const d of dismissals) {
      if (!dismissedByKind.has(d.kind)) dismissedByKind.set(d.kind, new Set());
      dismissedByKind.get(d.kind)!.add(d.entityId);
    }
  }
  const dismissedFollowupIds = Array.from(dismissedByKind.get("FOLLOWUP_ATRASADO") ?? []);
  const dismissedParcelaIds = Array.from(dismissedByKind.get("PARCELA_SEM_VENCIMENTO") ?? []);
  const dismissedDriveIds = Array.from(dismissedByKind.get("DRIVE_INCONSISTENCIA") ?? []);
  const dismissedApurarDecisaoIds = dismissedByKind.get("HONORARIO_APURAR_DECISAO") ?? new Set<string>();
  const dismissedApurarParadoIds = dismissedByKind.get("HONORARIO_APURAR_PARADO") ?? new Set<string>();

  const [
    overdueTasks,
    overduePayables,
    overdueReceivables,
    unreadMentions,
    undatedPayables,
    undatedReceivables,
    overdueFollowups,
    delegatedTasks,
    driveSyncIssues,
    apurarReceivables,
    overduePendenciasCount,
    overdueResponseDeadlinesCount,
  ] = await Promise.all([
    prisma.task.count({
      where: { officeId, dueDate: { lt: hoje }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
    }),
    includeFinance
      ? prisma.payable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, dueDate: { lt: hoje }, noDueDate: false } })
      : Promise.resolve(0),
    includeFinance
      ? prisma.receivable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, dueDate: { lt: hoje }, noDueDate: false } })
      : Promise.resolve(0),
    viewerId
      ? prisma.mention.count({ where: { officeId, userId: viewerId, read: false, ...(dismissedByKind.has("MENCAO") ? { commentId: { notIn: Array.from(dismissedByKind.get("MENCAO")!) } } : {}) } })
      : Promise.resolve(0),
    includeFinance
      ? prisma.payable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
      : Promise.resolve(0),
    includeFinance
      ? prisma.receivable.count({ where: { officeId, status: { in: ["PENDENTE", "ATRASADO"] }, noDueDate: true, id: { notIn: dismissedParcelaIds } } })
      : Promise.resolve(0),
    prisma.attendance.count({
      where: { officeId, nextContactAt: { lt: now }, stage: { notIn: ["FECHADO", "PERDIDO"] }, status: { not: "ARQUIVADO" }, id: { notIn: dismissedFollowupIds } },
    }),
    viewerId
      ? prisma.task.count({ where: { officeId, responsibleId: viewerId, delegatedById: { not: null }, delegationAcknowledgedAt: null } })
      : Promise.resolve(0),
    includeDriveSync ? prisma.driveSyncIssue.count({ where: { officeId, resolvedAt: null, id: { notIn: dismissedDriveIds } } }) : Promise.resolve(0),
    includeFinance
      ? prisma.receivable.findMany({ where: { officeId, status: "A_APURAR", caseId: { not: null } }, select: { id: true, createdAt: true, caseId: true } })
      : Promise.resolve([]),
    prisma.atendimentoPendencia.count({ where: { officeId, status: "PENDENTE", dueDate: { lt: now } } }),
    prisma.attendance.count({
      where: { officeId, responseDeadline: { lt: now }, firstResponseAt: null, status: { notIn: ["ARQUIVADO", "CONVERTIDO", "RASCUNHO"] } },
    }),
  ]);

  // Mesma lógica de getAlerts() acima para as duas Portas de apuração do êxito, só contando em
  // vez de montar o AlertItem inteiro — ver os comentários lá para o porquê de cada critério.
  const apurarCaseIds = Array.from(new Set(apurarReceivables.map((r) => r.caseId).filter((id): id is string => Boolean(id))));
  const decisaoCutoff = new Date(now.getTime() - DECISAO_JANELA_DIAS * 86400000);
  const publicacoesRecentes = apurarCaseIds.length
    ? await prisma.publication.findMany({
        where: { officeId, caseId: { in: apurarCaseIds }, publishedAt: { gte: decisaoCutoff } },
        select: { caseId: true, content: true },
      })
    : [];
  const casosComDecisaoNaoDispensados = new Set(
    publicacoesRecentes
      .filter((p) => p.caseId && !dismissedApurarDecisaoIds.has(p.caseId) && contemPalavraDecisao(p.content))
      .map((p) => p.caseId as string)
  );
  const parcelasParadas = apurarReceivables.filter(
    (r) => !dismissedApurarParadoIds.has(r.id) && now.getTime() - r.createdAt.getTime() >= APURAR_PARADO_DIAS * 86400000
  ).length;

  return (
    overdueTasks +
    overduePayables +
    overdueReceivables +
    unreadMentions +
    undatedPayables +
    undatedReceivables +
    overdueFollowups +
    delegatedTasks +
    driveSyncIssues +
    casosComDecisaoNaoDispensados.size +
    parcelasParadas +
    overduePendenciasCount +
    overdueResponseDeadlinesCount
  );
}

// Só a CONTAGEM de compromissos de hoje (tarefas/eventos/audiências/perícias/prazos, sem
// financeiro) — usada pela bolinha do item "Agenda" no menu (Sidebar e MobileBottomNav). Mesmo
// critério de tasksToday em getTodayItems logo abaixo (dueDate de hoje, sem concluído/cancelado),
// mas sem trazer o registro inteiro: a Sidebar renderiza em toda navegação, então um count() é
// bem mais barato que buscar case/responsible junto só para descartar depois.
export async function getTodayAgendaCount(officeId: string): Promise<number> {
  const now = new Date();
  return prisma.task.count({
    where: { officeId, dueDate: { gte: startOfDay(now), lte: endOfDay(now) }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
  });
}

// Tudo que vence HOJE: tarefas/eventos/audiências/perícias/prazos + contas a pagar/receber — reforço do dia.
export async function getTodayItems(officeId: string, includeFinance: boolean = true): Promise<TodayItem[]> {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(now);

  const [tasksToday, payablesToday, receivablesToday] = await Promise.all([
    prisma.task.findMany({
      where: { officeId, dueDate: { gte: start, lte: end }, status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
      include: { case: true },
      orderBy: { dueTime: "asc" },
    }),
    // PARCIAL entra também (reforço "vence hoje" — Fase 4: antes só PENDENTE/ATRASADO apareciam
    // aqui, então uma conta que já recebeu baixa parcial mas ainda vence hoje simplesmente sumia
    // do reforço do dia) — payments incluído para mostrar o SALDO EM ABERTO, não o valor cheio,
    // mesmo padrão do alerta de conta vencida acima.
    includeFinance
      ? prisma.payable.findMany({
          where: { officeId, dueDate: { gte: start, lte: end }, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, noDueDate: false },
          include: { payments: true },
        })
      : Promise.resolve([]),
    includeFinance
      ? prisma.receivable.findMany({
          where: { officeId, dueDate: { gte: start, lte: end }, status: { in: ["PENDENTE", "ATRASADO", "PARCIAL"] }, noDueDate: false },
          include: { payments: true },
        })
      : Promise.resolve([]),
  ]);

  const items: TodayItem[] = [];

  for (const t of tasksToday) {
    items.push({
      id: `task-today-${t.id}`,
      kind: (["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"].includes(t.type) ? t.type : "TAREFA") as TodayItem["kind"],
      title: t.title,
      subtitle: t.case?.title,
      time: t.dueTime,
      href: "/agenda",
      dueStatus: "hoje",
    });
  }
  for (const p of payablesToday) {
    const somaPaga = p.payments.reduce((s, x) => s + x.amount, 0);
    const saldo = saldoEmAberto(p.amount, p.discount, p.surcharge, somaPaga);
    items.push({
      id: `payable-today-${p.id}`,
      kind: "CONTA_PAGAR",
      title: p.description,
      subtitle: `R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${p.status === "PARCIAL" ? " (saldo em aberto)" : ""}`,
      href: "/financeiro/despesas",
    });
  }
  for (const r of receivablesToday) {
    const somaPaga = r.payments.reduce((s, x) => s + x.amount, 0);
    const saldo = saldoEmAberto(r.amount, r.discount, r.surcharge, somaPaga);
    items.push({
      id: `receivable-today-${r.id}`,
      kind: "CONTA_RECEBER",
      title: r.description,
      subtitle: `R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${r.status === "PARCIAL" ? " (saldo em aberto)" : ""}`,
      href: "/financeiro/receitas",
    });
  }

  return items;
}
