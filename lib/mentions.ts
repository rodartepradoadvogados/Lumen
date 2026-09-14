// Resolve, a partir de um Comment mencionando alguém, ONDE essa menção mora de verdade —
// título legível + link direto — para a Central de Alertas (lib/alerts.ts) e o resumo diário por
// e-mail (lib/email.ts), que precisam mostrar exatamente a mesma coisa.
//
// Causa raiz do achado "e-mail chega, Central de Alertas não ajuda a achar do que se trata"
// (setembro/2026): Comment pode estar preso a um Case, a uma Licitacao, OU a uma Task — e uma
// Task, por sua vez, pode pertencer a um Case, a uma Licitacao, a um Attendance, ou a nada
// (tarefa avulsa do Kanban pessoal). O código antigo só resolvia o primeiro nível (comment.case)
// e tratava TUDO o mais — comentário de tarefa, de licitação, de tarefa de licitação, de tarefa
// de atendimento — como o mesmo fallback genérico `/kanban`, sem nome de lugar nenhum no título.
// Como a var mencionada tem que "sair vasculhando cada processo, assessoria, caso atendimento"
// justamente porque o card não diz onde procurar, esta função existe para nunca mais devolver
// esse fallback quando há QUALQUER vínculo real a seguir.
export type MentionCommentContext = {
  content: string;
  case: { id: string; title: string; processNumber: string | null } | null;
  licitacao: { id: string; nome: string | null; objeto: string; assessoriaId: string } | null;
  task: {
    id: string;
    title: string;
    case: { id: string; title: string; processNumber: string | null } | null;
    licitacao: { id: string; nome: string | null; objeto: string; assessoriaId: string } | null;
    attendance: { id: string; clientName: string } | null;
  } | null;
};

// Mesmo shape em toda consulta que precisa montar MentionCommentContext — repassar direto ao
// `include`/`select` de comment dentro de um Comment.findMany/findUnique ou de um
// Mention.findMany({ include: { comment: { include: mentionCommentInclude } } }).
export const mentionCommentInclude = {
  case: { select: { id: true, title: true, processNumber: true } },
  licitacao: { select: { id: true, nome: true, objeto: true, assessoriaId: true } },
  task: {
    select: {
      id: true,
      title: true,
      case: { select: { id: true, title: true, processNumber: true } },
      licitacao: { select: { id: true, nome: true, objeto: true, assessoriaId: true } },
      attendance: { select: { id: true, clientName: true } },
    },
  },
} as const;

export type MentionLocation = {
  // Curto, para compor no título junto com "Fulano mencionou você em ...".
  label: string;
  href: string;
  processNumber?: string;
};

// Ordem de resolução: vínculo direto do comentário primeiro (comment.case/licitacao — comentário
// dado na aba Comentários do processo ou nas Anotações da licitação), depois o vínculo da TAREFA
// quando o comentário é de um card (TaskDetailModal) — mesma cadeia caseId/licitacaoId/
// attendanceId que Task já usa em todo o resto do produto (ver Task em prisma/schema.prisma).
export function describeMentionLocation(comment: MentionCommentContext): MentionLocation {
  if (comment.case) {
    return {
      label: `Processo: ${comment.case.title}`,
      href: `/processos/${comment.case.id}?tab=comentarios`,
      processNumber: comment.case.processNumber ?? undefined,
    };
  }
  if (comment.licitacao) {
    return {
      label: `Licitação: ${comment.licitacao.nome ?? comment.licitacao.objeto}`,
      href: `/assessoria/${comment.licitacao.assessoriaId}?tab=licitacoes`,
    };
  }
  if (comment.task?.case) {
    return {
      label: `Tarefa "${comment.task.title}" (processo: ${comment.task.case.title})`,
      href: `/processos/${comment.task.case.id}?tab=comentarios`,
      processNumber: comment.task.case.processNumber ?? undefined,
    };
  }
  if (comment.task?.licitacao) {
    return {
      label: `Tarefa "${comment.task.title}" (licitação: ${comment.task.licitacao.nome ?? comment.task.licitacao.objeto})`,
      href: `/assessoria/${comment.task.licitacao.assessoriaId}?tab=licitacoes`,
    };
  }
  if (comment.task?.attendance) {
    return {
      label: `Tarefa "${comment.task.title}" (atendimento: ${comment.task.attendance.clientName})`,
      href: `/atendimento/${comment.task.attendance.id}`,
    };
  }
  if (comment.task) {
    // Tarefa avulsa do Kanban pessoal — não presa a processo/licitação/atendimento nenhum. É o
    // único caso em que "/kanban" genérico é de fato o destino certo, não um fallback por falta
    // de dado: o card mencionado só existe lá.
    return { label: `Tarefa: ${comment.task.title}`, href: "/kanban" };
  }
  // Não deveria acontecer (addComment sempre grava taskId, caseId ou licitacaoId), mas sem um
  // dos três o melhor destino honesto é a própria Central de Alertas, não inventar um link.
  return { label: "comentário", href: "/alertas" };
}
