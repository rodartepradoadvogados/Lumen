import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/notificationOutbox";

// Documento 06 (Fase 3 — Comunicados) — varredura periódica pros 5 eventos que não nascem de uma
// única ação do usuário (ao contrário de TAREFA_DELEGADA/PUBLICACAO_NOVA/ANDAMENTO_PROCESSUAL/
// CONVITE_EQUIPE/HONORARIO_RECEBIDO, que são enfileirados direto no ponto de origem): são
// ESTADO ("este prazo está vencendo", "esta cobrança está atrasada"), então precisam de uma
// varredura por tempo. Chamada só por app/api/cron/comunicados-varredura/route.ts.
//
// dedupeKey tem o DIA no final (não um valor fixo) — de propósito: o mesmo prazo/cobrança em
// aberto deve gerar um lembrete NOVO a cada dia que continuar em aberto (não só uma vez na vida),
// mas nunca duas vezes no mesmo dia mesmo que o cron rode várias vezes (a constraint @unique de
// NotificationOutbox.dedupeKey barra a segunda tentativa, engolida em silêncio por
// enqueueNotification).
function diaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

export async function varrerComunicados(): Promise<{ enfileirados: number }> {
  const now = new Date();
  const hojeInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const amanha = new Date(hojeInicio.getTime() + 24 * 60 * 60 * 1000);
  const depoisDeAmanha = new Date(hojeInicio.getTime() + 2 * 24 * 60 * 60 * 1000);
  const em3Dias = new Date(hojeInicio.getTime() + 4 * 24 * 60 * 60 * 1000); // fim do dia +3
  const em5Dias = new Date(hojeInicio.getTime() + 6 * 24 * 60 * 60 * 1000); // fim do dia +5
  const dia = diaISO(now);
  let enfileirados = 0;

  // PRAZO_HOJE (exceção — fura a fila): Task tipo PRAZO vencendo hoje.
  const prazosHoje = await prisma.task.findMany({
    where: { type: "PRAZO", status: { notIn: ["CONCLUIDO", "CANCELADO"] }, responsibleId: { not: null }, dueDate: { gte: hojeInicio, lt: amanha } },
    select: { id: true, title: true, responsibleId: true, officeId: true, case: { select: { title: true, processNumber: true, tribunalSigla: true } } },
  });
  for (const t of prazosHoje) {
    const r = await enqueueNotification({
      userId: t.responsibleId!,
      officeId: t.officeId,
      event: "PRAZO_HOJE",
      title: "Prazo vence hoje",
      body: t.title,
      url: "/processos",
      vars: { teor: t.title, processo: t.case?.processNumber ?? t.case?.title, tribunal: t.case?.tribunalSigla ?? undefined },
      dedupeKey: `PRAZO_HOJE:${t.id}:${dia}`,
    });
    if (r) enfileirados++;
  }

  // AUDIENCIA_24H (exceção — fura a fila): Task tipo AUDIENCIA hoje ou amanhã. Task.dueDate só
  // guarda a data-calendário (meia-noite) — dueTime é um rótulo à parte, nunca combinado no
  // timestamp (ver lib/actions/tasks.ts:computeSafetyDueDate) — então "menos de 24h" de verdade
  // não dá pra calcular a partir do dado salvo; hoje+amanhã é a aproximação mais honesta (entre
  // ~0h e ~48h de antecedência, nunca mais que isso).
  const audienciasProximas = await prisma.task.findMany({
    where: { type: "AUDIENCIA", status: { notIn: ["CONCLUIDO", "CANCELADO"] }, responsibleId: { not: null }, dueDate: { gte: hojeInicio, lt: depoisDeAmanha } },
    select: { id: true, title: true, dueDate: true, dueTime: true, responsibleId: true, officeId: true, case: { select: { title: true, processNumber: true, tribunalSigla: true } } },
  });
  for (const t of audienciasProximas) {
    const r = await enqueueNotification({
      userId: t.responsibleId!,
      officeId: t.officeId,
      event: "AUDIENCIA_24H",
      title: "Audiência em breve",
      body: t.title,
      url: "/processos",
      vars: {
        teor: t.title,
        processo: t.case?.processNumber ?? t.case?.title,
        tribunal: t.case?.tribunalSigla ?? undefined,
        prazo: `${formatarData(t.dueDate)}${t.dueTime ? ` às ${t.dueTime}` : ""}`,
      },
      dedupeKey: `AUDIENCIA_24H:${t.id}:${dia}`,
    });
    if (r) enfileirados++;
  }

  // PRAZO_VENCENDO (Bloco 3 — por evento): Task tipo PRAZO vencendo em 2 ou 3 dias — janela
  // deliberadamente separada de PRAZO_HOJE (hoje é a exceção acima; amanhã fica de fora das duas
  // pra não duplicar aviso em dias consecutivos sem um critério do documento pra isso).
  const prazosVencendo = await prisma.task.findMany({
    where: { type: "PRAZO", status: { notIn: ["CONCLUIDO", "CANCELADO"] }, responsibleId: { not: null }, dueDate: { gte: depoisDeAmanha, lt: em3Dias } },
    select: { id: true, title: true, dueDate: true, responsibleId: true, officeId: true, case: { select: { title: true, processNumber: true, tribunalSigla: true } } },
  });
  for (const t of prazosVencendo) {
    const r = await enqueueNotification({
      userId: t.responsibleId!,
      officeId: t.officeId,
      event: "PRAZO_VENCENDO",
      title: "Prazo vencendo",
      body: t.title,
      url: "/processos",
      vars: { teor: t.title, processo: t.case?.processNumber ?? t.case?.title, tribunal: t.case?.tribunalSigla ?? undefined, prazo: formatarData(t.dueDate) },
      dedupeKey: `PRAZO_VENCENDO:${t.id}:${dia}`,
    });
    if (r) enfileirados++;
  }

  // Financeiro (Bloco 3): sempre para quem tem visibilidade do módulo (isAdmin ou
  // financeAccess), nunca para o escritório inteiro — mesmo gate de sempre no Financeiro.
  const officesComFinanceiro = await prisma.user.findMany({
    where: { active: true, OR: [{ isAdmin: true }, { financeAccess: true }] },
    select: { id: true, officeId: true },
  });
  const financeUsersByOffice = new Map<string, string[]>();
  for (const u of officesComFinanceiro) {
    const arr = financeUsersByOffice.get(u.officeId) ?? [];
    arr.push(u.id);
    financeUsersByOffice.set(u.officeId, arr);
  }

  // HONORARIO_A_RECEBER (Bloco 3): Receivable de honorário, ainda pendente, vencendo nos
  // próximos 5 dias (inclui hoje — não existe exceção "honorário vence hoje" separada).
  const honorariosAReceber = await prisma.receivable.findMany({
    where: { kind: { startsWith: "HONORARIOS" }, status: "PENDENTE", noDueDate: false, dueDate: { gte: hojeInicio, lt: em5Dias } },
    select: { id: true, description: true, dueDate: true, officeId: true, client: { select: { name: true } }, case: { select: { title: true, processNumber: true } } },
  });
  for (const rec of honorariosAReceber) {
    const destinatarios = financeUsersByOffice.get(rec.officeId) ?? [];
    for (const userId of destinatarios) {
      const r = await enqueueNotification({
        userId,
        officeId: rec.officeId,
        event: "HONORARIO_A_RECEBER",
        title: "Honorário a receber",
        body: rec.description,
        url: "/financeiro/contas-a-receber",
        vars: { teor: rec.description, cliente: rec.client?.name, processo: rec.case?.processNumber ?? rec.case?.title, prazo: formatarData(rec.dueDate) },
        dedupeKey: `HONORARIO_A_RECEBER:${rec.id}:${userId}:${dia}`,
      });
      if (r) enfileirados++;
    }
  }

  // COBRANCA_ATRASO (Bloco 3): qualquer conta a receber PENDENTE com vencimento no passado —
  // mesma definição de "ATRASADO" de lib/financeQuery.ts:effective (calculada aqui, nunca lida
  // do campo status, que continua PENDENTE até alguém dar baixa).
  const cobrancasAtrasadas = await prisma.receivable.findMany({
    where: { status: "PENDENTE", noDueDate: false, dueDate: { lt: hojeInicio } },
    select: { id: true, description: true, dueDate: true, officeId: true, client: { select: { name: true } }, case: { select: { title: true, processNumber: true } } },
  });
  for (const rec of cobrancasAtrasadas) {
    const destinatarios = financeUsersByOffice.get(rec.officeId) ?? [];
    for (const userId of destinatarios) {
      const r = await enqueueNotification({
        userId,
        officeId: rec.officeId,
        event: "COBRANCA_ATRASO",
        title: "Cobrança em atraso",
        body: rec.description,
        url: "/financeiro/contas-a-receber",
        vars: { teor: rec.description, cliente: rec.client?.name, processo: rec.case?.processNumber ?? rec.case?.title, prazo: formatarData(rec.dueDate) },
        dedupeKey: `COBRANCA_ATRASO:${rec.id}:${userId}:${dia}`,
      });
      if (r) enfileirados++;
    }
  }

  return { enfileirados };
}
