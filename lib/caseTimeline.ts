// Linha do tempo do processo (aba Visão Geral, 3º painel — ver proposta de remodelação do
// portal: "requisito confirmado pelo cliente, não colapsar"). Junta em uma única lista
// cronológica eventos que já vêm carregados na página do Processo (nenhuma query nova aqui,
// só reorganização do que já existe) — criação/distribuição do processo, escaladas de
// instância, tarefas concluídas, comentários, publicações recebidas e protocolos enviados.
export type CaseTimelineEvent = {
  id: string;
  date: string; // ISO
  kind: "criado" | "distribuido" | "escalada" | "retorno" | "tarefa" | "comentario" | "publicacao" | "protocolo";
  title: string;
  detail?: string;
};

// Teto de eventos retornados — a Linha do tempo é um resumo de "o que aconteceu", não um
// substituto das abas Atividades/Comentários/Publicações/Protocolos (que continuam completas,
// sem esse corte). Sem isso, um processo antigo e movimentado inundaria os 320px do painel.
const MAX_EVENTS = 40;

export function buildCaseTimeline(
  c: {
    id: string;
    createdAt: Date;
    distributedAt: Date | null;
    tasks: { id: string; title: string; type: string; completedAt: Date | null; completedBy: { name: string } | null }[];
    comments: { id: string; content: string; createdAt: Date; author: { name: string } }[];
    publications: { id: string; kind: string; source: string; publishedAt: Date; content: string }[];
    protocoloLotes: { id: string; titulo: string; status: string; protocoladoEm: Date | null; createdAt: Date }[];
  },
  instanceHistory: {
    id: string;
    fromInstance: string | null;
    toInstance: string;
    toTribunalSigla: string | null;
    escalatedAt: string;
    returnedAt: string | null;
  }[]
): CaseTimelineEvent[] {
  const events: CaseTimelineEvent[] = [];

  events.push({ id: `criado-${c.id}`, date: c.createdAt.toISOString(), kind: "criado", title: "Processo cadastrado no Lúmen" });
  if (c.distributedAt) {
    events.push({ id: `distribuido-${c.id}`, date: c.distributedAt.toISOString(), kind: "distribuido", title: "Distribuído" });
  }

  for (const f of instanceHistory) {
    events.push({
      id: `esc-${f.id}`,
      date: f.escalatedAt,
      kind: "escalada",
      title: `Subiu para ${f.toInstance}${f.toTribunalSigla ? ` (${f.toTribunalSigla})` : ""}`,
    });
    if (f.returnedAt) {
      events.push({ id: `ret-${f.id}`, date: f.returnedAt, kind: "retorno", title: `Retornou para ${f.fromInstance}` });
    }
  }

  for (const t of c.tasks) {
    if (!t.completedAt) continue;
    events.push({
      id: `tarefa-${t.id}`,
      date: t.completedAt.toISOString(),
      kind: "tarefa",
      title: `Concluída: ${t.title}`,
      detail: t.completedBy?.name,
    });
  }

  for (const cm of c.comments) {
    events.push({
      id: `comentario-${cm.id}`,
      date: cm.createdAt.toISOString(),
      kind: "comentario",
      title: `Comentário de ${cm.author.name}`,
      detail: cm.content.length > 120 ? `${cm.content.slice(0, 120)}…` : cm.content,
    });
  }

  for (const p of c.publications) {
    events.push({
      id: `pub-${p.id}`,
      date: p.publishedAt.toISOString(),
      kind: "publicacao",
      title: p.kind === "ANDAMENTO" ? `Andamento (${p.source})` : `Publicação (${p.source})`,
      detail: p.content.length > 120 ? `${p.content.slice(0, 120)}…` : p.content,
    });
  }

  for (const lote of c.protocoloLotes) {
    if (!lote.protocoladoEm) continue;
    events.push({ id: `protocolo-${lote.id}`, date: lote.protocoladoEm.toISOString(), kind: "protocolo", title: `Protocolado: ${lote.titulo}` });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events.slice(0, MAX_EVENTS);
}
